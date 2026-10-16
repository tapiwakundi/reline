import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { wellKnownRoutes } from "../../routes/well-known";

describe("OAuth well-known routes", () => {
  it("serves protected resource metadata at the MCP path", async () => {
    const response = await wellKnownRoutes.request(
      "/.well-known/oauth-protected-resource/api/mcp"
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    const body = (await response.json()) as {
      resource: string;
      authorization_servers: string[];
    };
    assert.match(body.resource, /\/api\/mcp$/);
    assert.equal(body.authorization_servers.length, 1);
  });

  it("serves authorization server metadata with PKCE S256", async () => {
    const response = await wellKnownRoutes.request(
      "/.well-known/oauth-authorization-server"
    );
    const body = (await response.json()) as {
      code_challenge_methods_supported: string[];
      token_endpoint_auth_methods_supported: string[];
    };
    assert.deepEqual(body.code_challenge_methods_supported, ["S256"]);
    assert.deepEqual(body.token_endpoint_auth_methods_supported, ["none"]);
    assert.equal(
      "client_id_metadata_document_supported" in body,
      false
    );
  });
});
