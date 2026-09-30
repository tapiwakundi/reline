import { Hono } from "hono";
import { classifyContentType, maxBytesFor } from "@reline/shared";
import { HttpError } from "@/lib/context";
import { objectKey, presignPut, publicUrl, putObject } from "@/lib/r2";
import { requireWorkspace, type WorkspaceEnv } from "@/middleware/auth";

export const attachmentsRoutes = new Hono<WorkspaceEnv>();

attachmentsRoutes.post("/attachments/presign", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const body = await c.req.json<{
    filename?: string;
    contentType?: string;
    size?: number;
  }>();
  const { filename, contentType, size } = body;
  if (!filename || !contentType || !size || size <= 0) {
    throw new HttpError(400, "Invalid request");
  }

  const media = classifyContentType(contentType);
  if (!media) {
    throw new HttpError(
      400,
      "Only images (jpeg, png, gif, webp, avif) and videos (mp4, webm, mov) are supported"
    );
  }

  if (size > maxBytesFor(media.kind)) {
    const limitMb = maxBytesFor(media.kind) / (1024 * 1024);
    throw new HttpError(
      400,
      `${media.kind === "image" ? "Images" : "Videos"} must be under ${limitMb} MB`
    );
  }

  const key = objectKey(ctx.workspace.id, media.ext);
  const uploadUrl = await presignPut(key, contentType, size);

  return c.json({
    key,
    uploadUrl,
    publicUrl: publicUrl(key),
    kind: media.kind,
  });
});

attachmentsRoutes.post("/attachments/upload", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Missing file");

  const contentType = file.type || "application/octet-stream";
  const size = file.size;
  const media = classifyContentType(contentType);
  if (!media) {
    throw new HttpError(
      400,
      "Only images (jpeg, png, gif, webp, avif) and videos (mp4, webm, mov) are supported"
    );
  }

  if (size > maxBytesFor(media.kind)) {
    const limitMb = maxBytesFor(media.kind) / (1024 * 1024);
    throw new HttpError(
      400,
      `${media.kind === "image" ? "Images" : "Videos"} must be under ${limitMb} MB`
    );
  }

  const key = objectKey(ctx.workspace.id, media.ext);
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    await putObject(key, bytes, contentType);
  } catch (e) {
    throw new HttpError(500, e instanceof Error ? e.message : "Upload failed");
  }

  return c.json({
    key,
    publicUrl: publicUrl(key),
    kind: media.kind,
    filename: file.name,
    contentType,
    size,
  });
});
