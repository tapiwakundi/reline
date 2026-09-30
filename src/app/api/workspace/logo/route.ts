import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { requireApiWorkspace } from "@/lib/api-auth";
import {
  IMAGE_TYPES,
  MAX_AVATAR_BYTES,
  deleteObjects,
  keyFromPublicUrl,
  logoObjectKey,
  logoPrefix,
  publicUrl,
  putObject,
} from "@/lib/r2";

export const runtime = "nodejs";

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

function requireOwner(
  ctx: Exclude<Awaited<ReturnType<typeof requireApiWorkspace>>, { error: Response }>
) {
  if (ctx.membership.role !== "owner") {
    return Response.json(
      { error: "Only the workspace owner can change the logo" },
      { status: 403 }
    );
  }
  return null;
}

export async function POST(req: Request) {
  const ctx = await requireApiWorkspace(req);
  if ("error" in ctx) return ctx.error;
  const denied = requireOwner(ctx);
  if (denied) return denied;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  const contentType = file.type || "application/octet-stream";
  const ext = IMAGE_TYPES[contentType];
  if (!ext) {
    return Response.json(
      { error: "Use a JPEG, PNG, GIF, WebP, or AVIF image" },
      { status: 400 }
    );
  }

  if (file.size <= 0) {
    return Response.json({ error: "That image is empty" }, { status: 400 });
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return Response.json({ error: "Logo must be under 5 MB" }, { status: 400 });
  }

  let key: string;
  try {
    key = logoObjectKey(ctx.workspace.id, ext);
  } catch {
    return Response.json({ error: "Could not save logo" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    await putObject(key, bytes, contentType);
  } catch (e) {
    return Response.json({ error: storageError(e) }, { status: 500 });
  }

  let logo: string;
  try {
    logo = publicUrl(key);
  } catch (e) {
    await deleteObjects([key]);
    return Response.json({ error: storageError(e) }, { status: 500 });
  }

  const previous = ownedLogoKey(ctx.workspace.logo, ctx.workspace.id);

  try {
    await db
      .update(workspaces)
      .set({ logo })
      .where(eq(workspaces.id, ctx.workspace.id));
  } catch (e) {
    await deleteObjects([key]);
    return Response.json({ error: storageError(e) }, { status: 500 });
  }

  if (previous && previous !== key) {
    await deleteObjects([previous]);
  }

  return Response.json({ logo });
}

export async function DELETE(req: Request) {
  const ctx = await requireApiWorkspace(req);
  if ("error" in ctx) return ctx.error;
  const denied = requireOwner(ctx);
  if (denied) return denied;

  const previous = ownedLogoKey(ctx.workspace.logo, ctx.workspace.id);

  try {
    await db
      .update(workspaces)
      .set({ logo: null })
      .where(eq(workspaces.id, ctx.workspace.id));
  } catch (e) {
    return Response.json({ error: storageError(e) }, { status: 500 });
  }

  if (previous) await deleteObjects([previous]);

  return Response.json({ logo: null });
}
