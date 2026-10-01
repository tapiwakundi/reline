import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleMcpHttpRequest, type McpHttpDeps } from "./http";
import { listTools } from "./protocol";

function deps(overrides: Partial<McpHttpDeps> = {}): McpHttpDeps {
  return {
    authenticate: async (authorization) =>
      authorization === "Bearer rel_test" ? { id: "user-1" } : null,
    callTool: async () => ({
      content: [{ type: "text", text: "REL-42 · Example" }],
    }),
    ...overrides,
  };
}

function post(body: unknown, init?: { authorization?: string; accept?: string; contentType?: string }) {
  return new Request("https://app.example.com/api/mcp", {
    method: "POST",
    headers: {
      "content-type": init?.contentType ?? "application/json",
      accept: init?.accept ?? "application/json, text/event-stream",
      ...(init?.authorization ? { authorization: init.authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("MCP HTTP", () => {
  it("rejects missing credentials without starting OAuth", async () => {
    const response = await handleMcpHttpRequest(
      post({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      deps()
    );
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), null);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  });

  it("lists only read-only tools", async () => {
    const response = await handleMcpHttpRequest(
      post(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { authorization: "Bearer rel_test", accept: "application/json" }
      ),
      deps()
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/json");
    const body = (await response.json()) as {
      result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
    };
    assert.deepEqual(
      body.result.tools.map((tool) => tool.name),
      listTools().map((tool) => tool.name)
    );
    assert.equal(
      body.result.tools.every((tool) => tool.annotations.readOnlyHint),
      true
    );
  });

  it("answers initialize as an SSE message when the client accepts it", async () => {
    const response = await handleMcpHttpRequest(
      post(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-03-26" },
        },
        { authorization: "Bearer rel_test" }
      ),
      deps()
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    const text = await response.text();
    assert.match(text, /^event: message\ndata: /);
    const payload = JSON.parse(text.replace(/^event: message\ndata: /, "").trim()) as {
      result: { instructions: string; protocolVersion: string };
    };
    assert.equal(payload.result.protocolVersion, "2025-03-26");
    assert.match(payload.result.instructions, /read-only/i);
  });

  it("loads an issue through get_issue and ignores write-shaped methods", async () => {
    let called: { userId: string; name: string; args: unknown } | null = null;
    const response = await handleMcpHttpRequest(
      post(
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "get_issue",
            arguments: { url: "https://app.example.com/acme/issue/REL-42" },
          },
        },
        { authorization: "Bearer rel_test", accept: "application/json" }
      ),
      deps({
        callTool: async (userId, name, args) => {
          called = { userId, name, args };
          return { content: [{ type: "text", text: "issue body" }] };
        },
      })
    );
    assert.equal(response.status, 200);
    assert.deepEqual(called, {
      userId: "user-1",
      name: "get_issue",
      args: { url: "https://app.example.com/acme/issue/REL-42" },
    });
    const body = (await response.json()) as {
      result: { content: { text: string }[]; isError: boolean };
    };
    assert.equal(body.result.isError, false);
    assert.equal(body.result.content[0]?.text, "issue body");

    const missing = await handleMcpHttpRequest(
      post(
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "create_issue" } },
        { authorization: "Bearer rel_test", accept: "application/json" }
      ),
      deps()
    );
    const missingBody = (await missing.json()) as {
      result: { isError: boolean };
    };
    assert.equal(missingBody.result.isError, true);
  });

  it("returns 202 for notifications and 405 for GET", async () => {
    const notification = await handleMcpHttpRequest(
      post(
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { authorization: "Bearer rel_test" }
      ),
      deps()
    );
    assert.equal(notification.status, 202);
    assert.equal(await notification.text(), "");

    const get = await handleMcpHttpRequest(
      new Request("https://app.example.com/api/mcp", { method: "GET" }),
      deps()
    );
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");
  });
});
