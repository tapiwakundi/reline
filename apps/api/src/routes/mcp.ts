import { Hono } from "hono";
import { handleMcpHttpRequest } from "@/lib/mcp/http";
import { authenticateMcpToken, bearerToken } from "@/lib/mcp/tokens";
import { callMcpTool } from "@/lib/mcp/tools";

export const mcpRoutes = new Hono();

mcpRoutes.all("/mcp", (c) =>
  handleMcpHttpRequest(c.req.raw, {
    authenticate: async (authorization) => {
      const secret = bearerToken(authorization);
      if (!secret) return null;
      return authenticateMcpToken(secret);
    },
    callTool: (userId, name, args, scope) =>
      callMcpTool({ id: userId, scope }, name, args),
  })
);
