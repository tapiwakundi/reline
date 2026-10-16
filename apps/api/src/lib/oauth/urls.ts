import { publicAppUrl } from "@/lib/public-url";
import { MCP_READ_SCOPE, MCP_WRITE_SCOPE } from "@/lib/mcp/types";

export function mcpIssuer(): string {
  return publicAppUrl();
}

export function mcpResourceUrl(): string {
  return `${mcpIssuer()}/api/mcp`;
}

export function mcpResourceMetadataUrl(): string {
  return `${mcpIssuer()}/.well-known/oauth-protected-resource/api/mcp`;
}

export function mcpAuthorizeUrl(): string {
  return `${mcpIssuer()}/api/oauth/authorize`;
}

export function mcpTokenUrl(): string {
  return `${mcpIssuer()}/api/oauth/token`;
}

export function mcpRegisterUrl(): string {
  return `${mcpIssuer()}/api/oauth/register`;
}

export function canonicalResource(value: string): string {
  return value.trim().replace(/\/$/, "");
}

export function resourceMatches(value: string | undefined): boolean {
  if (!value) return false;
  return canonicalResource(value) === canonicalResource(mcpResourceUrl());
}

export function oauthWwwAuthenticate(): string {
  return `Bearer resource_metadata="${mcpResourceMetadataUrl()}", scope="${MCP_WRITE_SCOPE}"`;
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [mcpIssuer()],
    bearer_methods_supported: ["header"],
    scopes_supported: [MCP_READ_SCOPE, MCP_WRITE_SCOPE],
  };
}

export function authorizationServerMetadata() {
  return {
    issuer: mcpIssuer(),
    authorization_endpoint: mcpAuthorizeUrl(),
    token_endpoint: mcpTokenUrl(),
    registration_endpoint: mcpRegisterUrl(),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [MCP_READ_SCOPE, MCP_WRITE_SCOPE],
  };
}
