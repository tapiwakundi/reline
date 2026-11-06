import { Hono } from "hono";
import { handleMcpHttpRequest } from "@/lib/mcp/http";
import { authenticateMcpToken, bearerToken } from "@/lib/mcp/tokens";
import { callMcpTool } from "@/lib/mcp/tools";
import { receiveUpload } from "@/lib/mcp/upload-link";

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

/** Upload links from create_attachment_upload point here; the bytes go on to R2. */
mcpRoutes.put("/mcp/uploads/:token", (c) =>
  receiveUpload(c.req.raw, c.req.param("token"))
);
