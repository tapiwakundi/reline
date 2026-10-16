import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CURSOR_MCP_DEEPLINK,
  filterRedirectUris,
  isAllowedRedirectUri,
  isLoopbackRedirect,
  redirectHost,
  withOAuthQuery,
} from "./redirect";

describe("OAuth redirect URIs", () => {
  it("allows HTTPS, loopback HTTP, and Cursor’s deeplink", () => {
    assert.equal(isAllowedRedirectUri("https://www.cursor.com/agents/mcp/oauth/callback"), true);
    assert.equal(isAllowedRedirectUri("http://localhost:8787/callback"), true);
    assert.equal(isAllowedRedirectUri("http://127.0.0.1:3118/callback"), true);
    assert.equal(isAllowedRedirectUri(CURSOR_MCP_DEEPLINK), true);
    assert.equal(isAllowedRedirectUri("http://evil.example/callback"), false);
    assert.equal(isAllowedRedirectUri("https://ok.example/path#frag"), false);
    assert.equal(isAllowedRedirectUri("not-a-url"), false);
  });

  it("keeps Cursor’s URIs and drops disallowed ones during registration", () => {
    assert.deepEqual(
      filterRedirectUris([
        "https://www.cursor.com/agents/mcp/oauth/callback",
        "http://localhost:8787/callback",
        "http://evil.example/steal",
        CURSOR_MCP_DEEPLINK,
        "http://localhost:8787/callback",
      ]),
      [
        "https://www.cursor.com/agents/mcp/oauth/callback",
        "http://localhost:8787/callback",
        CURSOR_MCP_DEEPLINK,
      ]
    );
  });

  it("labels loopback redirects for the consent screen", () => {
    assert.equal(isLoopbackRedirect("http://localhost:8787/callback"), true);
    assert.equal(isLoopbackRedirect("https://www.cursor.com/agents/mcp/oauth/callback"), false);
    assert.equal(redirectHost("http://localhost:8787/callback"), "localhost:8787");
    assert.equal(redirectHost(CURSOR_MCP_DEEPLINK), "cursor://");
  });

  it("appends OAuth query parameters without dropping the path", () => {
    assert.equal(
      withOAuthQuery("http://localhost:8787/callback", {
        code: "abc",
        state: "s",
      }),
      "http://localhost:8787/callback?code=abc&state=s"
    );
  });
});
