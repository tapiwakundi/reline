import { Hono } from "hono";
import { HttpError } from "@/lib/context";
import { requireUser, type AuthEnv } from "@/middleware/auth";
import {
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
} from "@/lib/mcp/tokens";

export const mcpTokenRoutes = new Hono<AuthEnv>();

mcpTokenRoutes.get("/mcp/tokens", requireUser, async (c) => {
  const tokens = await listMcpTokens(c.get("user").id);
  return c.json({ tokens });
});

mcpTokenRoutes.post("/mcp/tokens", requireUser, async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => null);
  if (!body || typeof body.name !== "string") {
    throw new HttpError(400, "Token name is required");
  }
  const token = await createMcpToken(c.get("user").id, body.name);
  return c.json({ token }, 201);
});

mcpTokenRoutes.delete("/mcp/tokens/:id", requireUser, async (c) => {
  await revokeMcpToken(c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});
