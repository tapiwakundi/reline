import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authorizationServerMetadata,
  canonicalResource,
  mcpResourceMetadataUrl,
  oauthWwwAuthenticate,
  protectedResourceMetadata,
  resourceMatches,
} from "./urls";

describe("OAuth discovery URLs", () => {
  it("advertises PKCE and public clients without CIMD", () => {
    const metadata = authorizationServerMetadata();
    assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
    assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ["none"]);
    assert.equal(
      "client_id_metadata_document_supported" in metadata,
      false
    );
    assert.match(metadata.authorization_endpoint, /\/api\/oauth\/authorize$/);
    assert.match(metadata.token_endpoint, /\/api\/oauth\/token$/);
    assert.match(metadata.registration_endpoint, /\/api\/oauth\/register$/);
  });

  it("names the MCP resource and this origin as the authorization server", () => {
    const metadata = protectedResourceMetadata();
    assert.match(metadata.resource, /\/api\/mcp$/);
    assert.equal(metadata.authorization_servers.length, 1);
    assert.deepEqual(metadata.scopes_supported, ["read", "write"]);
  });

  it("matches the resource URL with or without a trailing slash", () => {
    const resource = protectedResourceMetadata().resource;
    assert.equal(resourceMatches(resource), true);
    assert.equal(resourceMatches(`${resource}/`), true);
    assert.equal(resourceMatches("https://evil.example/api/mcp"), false);
    assert.equal(resourceMatches(undefined), false);
    assert.equal(canonicalResource(`${resource}/`), resource);
  });

  it("formats the WWW-Authenticate challenge", () => {
    const header = oauthWwwAuthenticate();
    assert.match(header, /^Bearer /);
    assert.equal(header.includes(mcpResourceMetadataUrl()), true);
    assert.match(header, /scope="write"/);
  });
});
