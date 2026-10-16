import {
  MCP_READ_SCOPE,
  MCP_WRITE_SCOPE,
  type McpScope,
} from "@/lib/mcp/types";

export function parseRequestedScope(value: string | undefined): McpScope {
  if (!value) return MCP_WRITE_SCOPE;
  const parts = value.split(/[\s+]+/).filter(Boolean);
  if (parts.includes(MCP_WRITE_SCOPE)) return MCP_WRITE_SCOPE;
  if (parts.includes(MCP_READ_SCOPE)) return MCP_READ_SCOPE;
  return MCP_WRITE_SCOPE;
}
