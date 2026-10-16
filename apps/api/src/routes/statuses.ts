import { Hono } from "hono";
import { HttpError } from "@/lib/context";
import { getWorkspaceStatuses } from "@/lib/queries";
import { requireWorkspace, type WorkspaceEnv } from "@/middleware/auth";
import {
  createStatus,
  deleteStatus,
  reorderStatuses,
  updateStatus,
} from "@/services/statuses";

export const statusesRoutes = new Hono<WorkspaceEnv>();

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function readJson(c: { req: { text: () => Promise<string> } }): Promise<unknown> {
  const raw = await c.req.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, "Invalid request");
  }
}

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Invalid request");
  }
  return value as Record<string, unknown>;
}

statusesRoutes.get("/statuses", requireWorkspace, async (c) => {
  const statuses = await getWorkspaceStatuses(c.get("ctx").workspace.id);
  return c.json({ statuses });
});

statusesRoutes.post("/statuses", requireWorkspace, async (c) => {
  const body = objectBody(await readJson(c));
  const statuses = await createStatus(c.get("ctx"), {
    name: asString(body.name) ?? "",
    type: asString(body.type) ?? "",
    color: asString(body.color) ?? "",
  });
  return c.json({ statuses });
});

statusesRoutes.post("/statuses/order", requireWorkspace, async (c) => {
  const body = objectBody(await readJson(c));
  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string")) {
    throw new HttpError(400, "Column order must include every column");
  }
  const statuses = await reorderStatuses(c.get("ctx"), body.ids);
  return c.json({ statuses });
});

statusesRoutes.patch("/statuses/:id", requireWorkspace, async (c) => {
  const body = objectBody(await readJson(c));
  const patch: { name?: string; type?: string; color?: string } = {};
  if ("name" in body) {
    const name = asString(body.name);
    if (name === undefined) throw new HttpError(400, "Column name is required");
    patch.name = name;
  }
  if ("type" in body) {
    const type = asString(body.type);
    if (type === undefined) throw new HttpError(400, "Choose a column category");
    patch.type = type;
  }
  if ("color" in body) {
    const color = asString(body.color);
    if (color === undefined) throw new HttpError(400, "Choose a column color");
    patch.color = color;
  }
  const statuses = await updateStatus(c.get("ctx"), c.req.param("id"), patch);
  return c.json({ statuses });
});

statusesRoutes.delete("/statuses/:id", requireWorkspace, async (c) => {
  const body = objectBody(await readJson(c));
  const moveToId = asString(body.moveToId);
  if ("moveToId" in body && body.moveToId != null && moveToId === undefined) {
    throw new HttpError(400, "Choose a column to move these issues into");
  }
  const statuses = await deleteStatus(c.get("ctx"), c.req.param("id"), moveToId);
  return c.json({ statuses });
});
