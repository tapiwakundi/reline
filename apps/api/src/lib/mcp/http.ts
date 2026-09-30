import {
  DEFAULT_PROTOCOL_VERSION,
  handleMcpMessage,
  type RpcResponse,
} from "@/lib/mcp/protocol";
import type { McpToolResult } from "@/lib/mcp/types";

const MAX_BODY_BYTES = 1_000_000;

export type McpHttpDeps = {
  authenticate: (
    authorization: string | undefined
  ) => Promise<{ id: string } | null>;
  callTool: (
    userId: string,
    name: string,
    args: unknown
  ) => Promise<McpToolResult>;
};

export async function handleMcpHttpRequest(
  request: Request,
  deps: McpHttpDeps
): Promise<Response> {
  if (request.method === "GET" || request.method === "DELETE") {
    return methodNotAllowed();
  }
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  const accept = request.headers.get("accept");
  if (accept && !clientAcceptsMcp(accept)) {
    return json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: "Not acceptable" },
      },
      406
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Content-Type must be application/json" },
      },
      415
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Request too large" },
      },
      400
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Request too large" },
      },
      400
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return respond(
      request,
      [
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        },
      ],
      400
    );
  }

  const actor = await deps.authenticate(request.headers.get("authorization") ?? undefined);
  if (!actor) {
    // Plain 401 with no WWW-Authenticate header. OAuth discovery would make
    // Cursor ignore the bearer token configured in mcp.json.
    return json({ error: "Unauthorized" }, 401);
  }

  const messages = Array.isArray(payload) ? payload : [payload];
  if (!messages.length) {
    return respond(
      request,
      [
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid request" },
        },
      ],
      400
    );
  }

  const responses: RpcResponse[] = [];
  for (const message of messages) {
    const response = await handleMcpMessage(message, {
      callTool: (name, args) => deps.callTool(actor.id, name, args),
    });
    if (response) responses.push(response);
  }

  if (!responses.length) {
    return new Response(null, {
      status: 202,
      headers: { "cache-control": "no-store" },
    });
  }

  return respond(request, responses, 200);
}

function respond(request: Request, responses: RpcResponse[], status: number): Response {
  const accept = request.headers.get("accept");
  const protocol = protocolVersionHeader(responses);
  const headers: Record<string, string> = {
    "cache-control": "no-store",
    "mcp-protocol-version": protocol,
  };
  const body = responses.length === 1 ? responses[0] : responses;

  if (accept?.toLowerCase().includes("text/event-stream")) {
    const events = responses
      .map((response) => `event: message\ndata: ${JSON.stringify(response)}\n\n`)
      .join("");
    return new Response(events, {
      status,
      headers: { ...headers, "content-type": "text/event-stream" },
    });
  }

  return json(body, status, headers);
}

function protocolVersionHeader(responses: RpcResponse[]): string {
  for (const response of responses) {
    const version = (response.result as { protocolVersion?: unknown } | undefined)
      ?.protocolVersion;
    if (typeof version === "string") return version;
  }
  return DEFAULT_PROTOCOL_VERSION;
}

function clientAcceptsMcp(accept: string): boolean {
  const value = accept.toLowerCase();
  return (
    value.includes("application/json") ||
    value.includes("text/event-stream") ||
    value.includes("*/*")
  );
}

function methodNotAllowed(): Response {
  return json(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: "Method not allowed" },
    },
    405,
    { allow: "POST" }
  );
}

function json(
  body: unknown,
  status: number,
  extra?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...extra,
    },
  });
}
