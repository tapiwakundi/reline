import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import {
  IMAGE_TYPES,
  MAX_AVATAR_BYTES,
  type BoardDisplayPrefs,
} from "@reline/shared";
import { getWorkspaceSettings } from "@/lib/queries";
import { HttpError } from "@/lib/context";
import {
  clearWorkspaceSlugCookie,
  workspaceSlugCookie,
} from "@/lib/session";
import {
  deleteObjects,
  keyFromPublicUrl,
  logoObjectKey,
  logoPrefix,
  publicUrl,
  putObject,
} from "@/lib/r2";
import { requireUser, requireWorkspace, type AuthEnv, type WorkspaceEnv } from "@/middleware/auth";
import { updateBoardDisplayPrefs } from "@/services/board-display";
import {
  createInvite,
  createWorkspace,
  deleteWorkspace,
  removeWorkspaceMember,
} from "@/services/workspace";
import { updateWorkspaceCycleName } from "@/services/cycles";

export const workspaceRoutes = new Hono<WorkspaceEnv & AuthEnv>();

workspaceRoutes.get("/workspace", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const settings = await getWorkspaceSettings(
    ctx.workspace,
    ctx.membership.role,
    ctx.user.id
  );
  return c.json(settings);
});

workspaceRoutes.post("/workspaces", requireUser, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ name: string; prefix?: string }>();
  const { slug } = await createWorkspace(user, body);
  c.header("Set-Cookie", workspaceSlugCookie(slug));
  return c.json({ slug });
});

workspaceRoutes.post("/workspace/cycle-name", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const body = await c.req.json<{ name?: string }>();
  const result = await updateWorkspaceCycleName(ctx, body.name ?? "");
  return c.json(result);
});

workspaceRoutes.post("/workspace/invites", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const result = await createInvite(ctx);
  return c.json(result);
});

workspaceRoutes.post("/workspace/board-display", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const prefs = await c.req.json<BoardDisplayPrefs>();
  await updateBoardDisplayPrefs(ctx, prefs);
  return c.json({ ok: true });
});

workspaceRoutes.delete(
  "/workspace/members/:userId",
  requireWorkspace,
  async (c) => {
    const ctx = c.get("ctx");
    const { left, remaining } = await removeWorkspaceMember(
      ctx,
      c.req.param("userId")
    );
    if (!left) return c.json({ slug: ctx.workspace.slug });
    if (!remaining.length) {
      c.header("Set-Cookie", clearWorkspaceSlugCookie());
      return c.json({ slug: null });
    }
    c.header("Set-Cookie", workspaceSlugCookie(remaining[0].slug));
    return c.json({ slug: remaining[0].slug });
  }
);

workspaceRoutes.delete("/workspace", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const body = await c.req.json<{ confirmName: string }>();
  const { remaining } = await deleteWorkspace(ctx, body.confirmName);
  if (!remaining.length) {
    c.header("Set-Cookie", clearWorkspaceSlugCookie());
    return c.json({ slug: null });
  }
  c.header("Set-Cookie", workspaceSlugCookie(remaining[0].slug));
  return c.json({ slug: remaining[0].slug });
});

function ownedLogoKey(url: string | null | undefined, workspaceId: string) {
  if (!url) return null;
  const key = keyFromPublicUrl(url);
  if (!key) return null;
  const prefix = logoPrefix(workspaceId);
  if (!key.startsWith(prefix)) return null;
  return key;
}

function storageError(e: unknown) {
  const message = e instanceof Error ? e.message : "Upload failed";
  if (message.includes("is not set")) return "Logo storage is not configured";
  return message;
}

workspaceRoutes.post("/workspace/logo", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  if (ctx.membership.role !== "owner") {
    throw new HttpError(403, "Only the workspace owner can change the logo");
  }

  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Missing file");

  const contentType = file.type || "application/octet-stream";
  const ext = IMAGE_TYPES[contentType];
  if (!ext) {
    throw new HttpError(400, "Use a JPEG, PNG, GIF, WebP, or AVIF image");
  }
  if (file.size <= 0) throw new HttpError(400, "That image is empty");
  if (file.size > MAX_AVATAR_BYTES) {
    throw new HttpError(400, "Logo must be under 5 MB");
  }

  let key: string;
  try {
    key = logoObjectKey(ctx.workspace.id, ext);
  } catch {
    throw new HttpError(400, "Could not save logo");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    await putObject(key, bytes, contentType);
  } catch (e) {
    throw new HttpError(500, storageError(e));
  }

  let logo: string;
  try {
    logo = publicUrl(key);
  } catch (e) {
    await deleteObjects([key]);
    throw new HttpError(500, storageError(e));
  }

  const previous = ownedLogoKey(ctx.workspace.logo, ctx.workspace.id);

  try {
    await db
      .update(workspaces)
      .set({ logo })
      .where(eq(workspaces.id, ctx.workspace.id));
  } catch (e) {
    await deleteObjects([key]);
    throw new HttpError(500, storageError(e));
  }

  if (previous && previous !== key) {
    await deleteObjects([previous]);
  }

  return c.json({ logo });
});

workspaceRoutes.delete("/workspace/logo", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  if (ctx.membership.role !== "owner") {
    throw new HttpError(403, "Only the workspace owner can change the logo");
  }

  const previous = ownedLogoKey(ctx.workspace.logo, ctx.workspace.id);

  try {
    await db
      .update(workspaces)
      .set({ logo: null })
      .where(eq(workspaces.id, ctx.workspace.id));
  } catch (e) {
    throw new HttpError(500, storageError(e));
  }

  if (previous) await deleteObjects([previous]);
  return c.json({ logo: null });
});
