import {
  MCP_INSTRUCTIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  type McpToolResult,
} from "@/lib/mcp/types";

export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
] as const;

export const DEFAULT_PROTOCOL_VERSION = "2025-03-26";

export type JsonRpcId = string | number | null;

export type RpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string };
};

export type McpToolCaller = (
  name: string,
  args: unknown
) => Promise<McpToolResult>;

const TOOLS = [
  {
    name: "get_issue",
    title: "Get issue",
    description:
      "Read a Reline issue from a ticket link or key. Use this whenever the user pastes or mentions a Reline URL (a path like /acme/issue/REL-42) or an issue key such as REL-42. Returns the title, description, status, priority, assignee, labels, cycle, comments, and attachments. Image attachments are included so you can see them. Read-only: this cannot change the issue.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "Full Reline issue URL, for example https://example.com/acme/issue/REL-42. Prefer this when the user shares a link.",
        },
        identifier: {
          type: "string",
          description: "Issue key such as REL-42, when a URL was not provided.",
        },
        workspace: {
          type: "string",
          description:
            "Workspace slug. Use this with identifier when the key exists in more than one workspace you can access.",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Get issue",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "get_attachment",
    title: "Get attachment",
    description:
      "Fetch one issue or comment attachment by the id returned from get_issue. Images are returned as image content. Videos are returned as a URL only. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Attachment id from get_issue.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: {
      title: "Get attachment",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
] as const;

export function listTools() {
  return TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  }));
}

export async function handleMcpMessage(
  message: unknown,
  ctx: { callTool: McpToolCaller }
): Promise<RpcResponse | null> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return rpcError(null, -32600, "Invalid request");
  }
  const record = message as Record<string, unknown>;
  if (record.jsonrpc !== "2.0") {
    return rpcError(validId(record.id) ?? null, -32600, "Invalid request");
  }

  const hasId = Object.prototype.hasOwnProperty.call(record, "id");
  const id = hasId ? validId(record.id) : undefined;
  if (hasId && id === undefined) {
    return rpcError(null, -32600, "Invalid request");
  }

  if (typeof record.method !== "string" || !record.method) {
    return rpcError(id ?? null, -32600, "Invalid request");
  }

  if (!hasId || record.method.startsWith("notifications/")) {
    return null;
  }

  const responseId = id ?? null;
  try {
    const result = await dispatch(record.method, record.params, ctx);
    return { jsonrpc: "2.0", id: responseId, result };
  } catch (error) {
    if (error instanceof RpcError) {
      return rpcError(responseId, error.code, error.message);
    }
    console.error(error);
    return rpcError(responseId, -32603, "Internal error");
  }
}

async function dispatch(
  method: string,
  params: unknown,
  ctx: { callTool: McpToolCaller }
): Promise<unknown> {
  switch (method) {
    case "initialize":
      return initializeResult(params);
    case "ping":
      return {};
    case "tools/list": {
      const cursor = namedString(params, "cursor");
      if (cursor) return { tools: [] };
      return { tools: listTools() };
    }
    case "tools/call":
      return callTool(params, ctx.callTool);
    case "resources/list":
      return { resources: [] };
    case "resources/templates/list":
      return { resourceTemplates: [] };
    case "prompts/list":
      return { prompts: [] };
    case "logging/setLevel":
      return {};
    default:
      throw new RpcError(-32601, `Method not found: ${method}`);
  }
}

function initializeResult(params: unknown) {
  const requested = namedString(params, "protocolVersion");
  const protocolVersion =
    requested &&
    SUPPORTED_PROTOCOL_VERSIONS.includes(
      requested as (typeof SUPPORTED_PROTOCOL_VERSIONS)[number]
    )
      ? requested
      : DEFAULT_PROTOCOL_VERSION;
  return {
    protocolVersion,
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
    instructions: MCP_INSTRUCTIONS,
  };
}

async function callTool(
  params: unknown,
  call: McpToolCaller
): Promise<unknown> {
  const name = namedString(params, "name");
  if (!name) throw new RpcError(-32602, "Tool name is required");
  const known = TOOLS.some((tool) => tool.name === name);
  if (!known) {
    return {
      content: [
        {
          type: "text",
          text: "Unknown tool. This server only provides read-only issue lookup.",
        },
      ],
      isError: true,
    };
  }
  const args = namedArgs(params);
  const result = await call(name, args);
  return {
    content: result.content,
    isError: Boolean(result.isError),
  };
}

function namedArgs(params: unknown): unknown {
  if (params === undefined) return {};
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new RpcError(-32602, "Invalid params");
  }
  const args = (params as Record<string, unknown>).arguments;
  if (args === undefined) return {};
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new RpcError(-32602, "Invalid params");
  }
  return args;
}

function namedString(params: unknown, key: string): string | undefined {
  if (!params || typeof params !== "object" || Array.isArray(params)) return undefined;
  const value = (params as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function validId(id: unknown): JsonRpcId | undefined {
  if (id === null) return null;
  if (typeof id === "string" || typeof id === "number") return id;
  return undefined;
}

function rpcError(id: JsonRpcId, code: number, message: string): RpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

class RpcError extends Error {
  constructor(
    public code: number,
    message: string
  ) {
    super(message);
    this.name = "RpcError";
  }
}
