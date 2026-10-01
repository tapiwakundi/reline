import { Hono } from "hono";
import { handleMcpHttpRequest } from "@/lib/mcp/http";
import { authenticateMcpToken, bearerToken } from "@/lib/mcp/tokens";
import { callReadOnlyTool } from "@/lib/mcp/tools";

export const mcpRoutes = new Hono();

mcpRoutes.all("/mcp", (c) =>
  handleMcpHttpRequest(c.req.raw, {
    authenticate: async (authorization) => {
      const secret = bearerToken(authorization);
      if (!secret) return null;
      const actor = await authenticateMcpToken(secret);
      return actor ? { id: actor.id } : null;
    },
    callTool: (userId, name, args) => callReadOnlyTool(userId, name, args),
  })
);
