import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import { HttpError } from "@/lib/context";
import { requireUser, type AuthEnv } from "@/middleware/auth";
import {
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
} from "@/lib/mcp/tokens";

export const mcpTokenRoutes = new Hono<AuthEnv>();

mcpTokenRoutes.get("/mcp/default-workspace", requireUser, async (c) => {
  const rows = await db.query.memberships.findMany({
    where: eq(memberships.userId, c.get("user").id),
    with: { workspace: { columns: { slug: true, name: true } } },
  });
  return c.json({
    workspaces: rows.map((row) => row.workspace),
    defaultSlug: rows.find((row) => row.isDefault)?.workspace.slug ?? null,
  });
});

mcpTokenRoutes.put("/mcp/default-workspace", requireUser, async (c) => {
  const body = await c.req.json<{ slug?: string | null }>().catch(() => null);
  if (!body || (body.slug !== null && typeof body.slug !== "string")) {
    throw new HttpError(400, "Workspace is required");
  }
  const userId = c.get("user").id;
  const rows = await db.query.memberships.findMany({
    where: eq(memberships.userId, userId),
    with: { workspace: { columns: { slug: true } } },
  });
  const target = rows.find((row) => row.workspace.slug === body.slug);
  if (body.slug !== null && !target) throw new HttpError(404, "Workspace not found");
  // One statement, so the user never ends up with two defaults.
  await db
    .update(memberships)
    .set({ isDefault: target ? sql`${memberships.id} = ${target.id}` : false })
    .where(eq(memberships.userId, userId));
  return c.json({ ok: true });
});

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
