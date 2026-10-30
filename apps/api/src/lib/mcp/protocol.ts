import { MAX_ATTACHMENTS } from "@reline/shared";
import {
  MAX_MCP_ATTACHMENT_BYTES,
  MAX_MCP_ATTACHMENTS_TOTAL_BYTES,
} from "@/lib/mcp/attachment-input";
import { ISSUE_DESCRIPTION_GUIDE } from "@/lib/mcp/issue-fields";
import {
  MCP_READ_INSTRUCTIONS,
  MCP_READ_ONLY_TOKEN_MESSAGE,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_WRITE_INSTRUCTIONS,
  MCP_WRITE_SCOPE,
  type McpScope,
  type McpToolResult,
} from "@/lib/mcp/types";
import { publicAppUrl } from "@/lib/public-url";

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

const DESCRIPTION_PROPERTY = {
  type: "string",
  description:
    "Replaces the issue description. " +
    ISSUE_DESCRIPTION_GUIDE +
    " Example:\n## Summary\nLogin fails after the redirect.\n\n## Steps\n1. Open the app\n2. Sign in\n\n- Check the callback URL\n- [ ] Confirm the cookie domain",
} as const;

const ATTACHMENTS_PROPERTY = {
  type: "array",
  maxItems: MAX_ATTACHMENTS,
  items: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description:
          "File name to show on the issue, such as screenshot.png. Optional with url.",
      },
      url: {
        type: "string",
        description:
          "Public https URL of the file. Reline downloads it, so prefer this when the file is already hosted.",
      },
      upload: {
        type: "string",
        description:
          "The upload value from create_attachment_upload, after the file has been PUT to its upload URL. Prefer this for local files.",
      },
      data: {
        type: "string",
        description:
          "File contents as base64. A data: URL also works. Use only when url and upload are not possible, because it is slow.",
      },
    },
    additionalProperties: false,
  },
} as const;

const ATTACHMENTS_GUIDE = `Images (jpeg, png, gif, webp, avif) and videos (mp4, webm, mov), up to ${MAX_ATTACHMENTS} files, each under ${MAX_MCP_ATTACHMENT_BYTES / (1024 * 1024)} MB and ${MAX_MCP_ATTACHMENTS_TOTAL_BYTES / (1024 * 1024)} MB together. The file type is read from the contents. Each item needs exactly one of url, upload, or data.`;

const TOOLS = [
  {
    name: "get_issue",
    title: "Get issue",
    description:
      "Read a Reline issue from a ticket link or key. Use this whenever the user pastes or mentions a Reline URL (a path like /acme/issue/REL-42) or an issue key such as REL-42. Returns the title, description, status, priority, assignee, labels, cycle, epic, child issues, comments, and attachments. Image attachments are included so you can see them. Read-only: this cannot change the issue.",
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
    requiresWrite: false,
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
    requiresWrite: false,
  },
  {
    name: "create_issue",
    title: "Create issue",
    description:
      "Create an issue or epic in a workspace the user belongs to. Write the description in markdown so it renders with headings, lists, quotes, and the other formatting the issue editor supports. Use type epic for an epic. Use the epic field to put a new ticket under an epic. When type is epic, pass issues to attach existing tickets. Pass attachments to upload screenshots or videos with the ticket. Returns the created issue.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Issue title.",
        },
        description: {
          ...DESCRIPTION_PROPERTY,
          description:
            "Optional description. " +
            ISSUE_DESCRIPTION_GUIDE +
            " Example:\n## Summary\nLogin fails after the redirect.\n\n## Steps\n1. Open the app\n2. Sign in\n\n- Check the callback URL\n- [ ] Confirm the cookie domain",
        },
        workspace: {
          type: "string",
          description:
            "Workspace slug, such as acme. Required when the user belongs to more than one workspace and has not set a default.",
        },
        status: {
          type: "string",
          description:
            "Status name in that workspace, such as Backlog, Todo, In Progress, Done, or Canceled. Defaults to Backlog.",
        },
        priority: {
          type: "string",
          description: "No priority, Urgent, High, Medium, or Low. Defaults to No priority.",
        },
        type: {
          type: "string",
          description: "epic, story, task, or bug. Defaults to story.",
        },
        epic: {
          type: "string",
          description:
            "Epic this ticket belongs to. An issue key such as REL-12, a Reline URL, or the epic title. Pass none to leave it out of an epic. An epic cannot belong to another epic.",
        },
        issues: {
          type: "array",
          items: { type: "string" },
          description:
            "Issue keys or URLs to attach to this epic, such as REL-42. Only when type is epic. Moves those tickets onto this epic.",
        },
        assignee: {
          type: "string",
          description:
            "Member name, first name, or email, or me. Pass none to leave the issue unassigned.",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Label names that already exist in the workspace.",
        },
        cycle: {
          type: "string",
          description:
            "Cycle name or number, such as Sprint 3 or 3, or active for the current cycle. Pass none to leave it out of a cycle.",
        },
        attachments: {
          ...ATTACHMENTS_PROPERTY,
          description: `Optional files to attach to the new issue, such as screenshots or screen recordings. ${ATTACHMENTS_GUIDE}`,
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    annotations: {
      title: "Create issue",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    requiresWrite: true,
  },
  {
    name: "update_issue",
    title: "Update issue",
    description:
      "Edit an existing issue or epic. Pass only the fields that should change. Description replaces the whole description, so call get_issue first and keep the parts the user did not ask to change. Use the issue editor's markdown for headings, bullets, numbered lists, checkboxes, quotes, code, and inline marks. Set epic to attach or remove a parent epic. On an epic, pass issues to attach tickets. Pass attachments to add screenshots or videos. Cannot delete the issue or its attachments.",
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
            "Workspace slug. Use this with identifier when the key exists in more than one workspace.",
        },
        title: {
          type: "string",
          description: "New title.",
        },
        description: DESCRIPTION_PROPERTY,
        status: {
          type: "string",
          description:
            "Status name in that workspace, such as Backlog, Todo, In Progress, Done, or Canceled.",
        },
        priority: {
          type: "string",
          description: "No priority, Urgent, High, Medium, or Low.",
        },
        type: {
          type: "string",
          description: "epic, story, task, or bug.",
        },
        epic: {
          type: "string",
          description:
            "Epic this ticket belongs to. An issue key such as REL-12, a Reline URL, or the epic title. Pass none to remove it. An epic cannot belong to another epic.",
        },
        issues: {
          type: "array",
          items: { type: "string" },
          description:
            "Issue keys or URLs to attach to this epic, such as REL-42. Only when this issue is an epic. Adds those tickets and leaves tickets already in the epic. To remove a ticket, update that ticket and set epic to none.",
        },
        assignee: {
          type: "string",
          description: "Member name, first name, or email, or me. Pass none to unassign.",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description:
            "Label names that already exist in the workspace. Replaces the issue's labels. Pass an empty array to clear them.",
        },
        cycle: {
          type: "string",
          description:
            "Cycle name or number, such as Sprint 3 or 3, or active for the current cycle. Pass none to clear the cycle.",
        },
        attachments: {
          ...ATTACHMENTS_PROPERTY,
          description: `Files to add to the issue. Existing attachments stay. ${ATTACHMENTS_GUIDE}`,
        },
      },
      additionalProperties: false,
    },
    annotations: {
      title: "Update issue",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    requiresWrite: true,
  },
  {
    name: "create_attachment_upload",
    title: "Create attachment upload",
    description:
      "Get a short-lived link for uploading a local screenshot or video without sending it through a tool call. PUT the file to the returned URL with the returned headers, then pass the returned attachment object in attachments on create_issue or update_issue. This is much faster than base64 when you can make network requests or run commands.",
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "File name to show on the issue, such as screenshot.png.",
        },
        contentType: {
          type: "string",
          description: "File type, such as image/png or video/mp4.",
        },
        size: {
          type: "integer",
          description: "Exact file size in bytes.",
        },
        workspace: {
          type: "string",
          description:
            "Workspace slug of the issue this file is for. Required when the user belongs to more than one workspace and has not set a default.",
        },
      },
      required: ["filename", "contentType", "size"],
      additionalProperties: false,
    },
    annotations: {
      title: "Create attachment upload",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    requiresWrite: true,
  },
] as const;

export function listTools(scope: McpScope) {
  return TOOLS.filter((tool) => scope === MCP_WRITE_SCOPE || !tool.requiresWrite).map(
    (tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    })
  );
}

export function instructionsFor(scope: McpScope): string {
  return scope === MCP_WRITE_SCOPE ? MCP_WRITE_INSTRUCTIONS : MCP_READ_INSTRUCTIONS;
}

export async function handleMcpMessage(
  message: unknown,
  ctx: { scope: McpScope; callTool: McpToolCaller }
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
  ctx: { scope: McpScope; callTool: McpToolCaller }
): Promise<unknown> {
  switch (method) {
    case "initialize":
      return initializeResult(params, ctx.scope);
    case "ping":
      return {};
    case "tools/list": {
      const cursor = namedString(params, "cursor");
      if (cursor) return { tools: [] };
      return { tools: listTools(ctx.scope) };
    }
    case "tools/call":
      return callTool(params, ctx.scope, ctx.callTool);
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

export function mcpServerInfo() {
  const origin = publicAppUrl();
  return {
    name: MCP_SERVER_NAME,
    title: "Reline",
    version: MCP_SERVER_VERSION,
    websiteUrl: origin,
    icons: [
      {
        src: `${origin}/icons/icon-192.png`,
        mimeType: "image/png",
        sizes: ["192x192"],
      },
      {
        src: `${origin}/icons/icon-512.png`,
        mimeType: "image/png",
        sizes: ["512x512"],
      },
    ],
  };
}

function initializeResult(params: unknown, scope: McpScope) {
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
    serverInfo: mcpServerInfo(),
    instructions: instructionsFor(scope),
  };
}

async function callTool(
  params: unknown,
  scope: McpScope,
  call: McpToolCaller
): Promise<unknown> {
  const name = namedString(params, "name");
  if (!name) throw new RpcError(-32602, "Tool name is required");
  const tool = TOOLS.find((item) => item.name === name);
  if (!tool) {
    return {
      content: [{ type: "text", text: "Unknown tool." }],
      isError: true,
    };
  }
  if (tool.requiresWrite && scope !== MCP_WRITE_SCOPE) {
    return {
      content: [{ type: "text", text: MCP_READ_ONLY_TOKEN_MESSAGE }],
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
