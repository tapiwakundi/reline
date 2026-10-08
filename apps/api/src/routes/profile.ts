import { Hono } from "hono";
import { IMAGE_TYPES, MAX_AVATAR_BYTES } from "@reline/shared";
import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/context";
import {
  avatarObjectKey,
  avatarPrefix,
  deleteObjects,
  keyFromPublicUrl,
  publicUrl,
  putObject,
} from "@/lib/r2";
import { requireUser, type AuthEnv } from "@/middleware/auth";
import { getSessionFromHeaders } from "@/lib/session";
import { isBlankCanvasWebp } from "@/lib/avatar-file";

export const profileRoutes = new Hono<AuthEnv>();

function ownedAvatarKey(url: string | null | undefined, userId: string) {
  if (!url) return null;
  const key = keyFromPublicUrl(url);
  if (!key) return null;
  const prefix = avatarPrefix(userId);
  if (!key.startsWith(prefix)) return null;
  return key;
}

function storageError(e: unknown) {
  const message = e instanceof Error ? e.message : "Upload failed";
  if (message.includes("is not set")) return "Photo storage is not configured";
  return message;
}

profileRoutes.post("/profile/avatar", requireUser, async (c) => {
  const user = c.get("user");
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
    throw new HttpError(400, "Photo must be under 5 MB");
  }
  if (isBlankCanvasWebp(contentType, file.size)) {
    throw new HttpError(400, "Could not read that photo. Try uploading it again.");
  }

  let key: string;
  try {
    key = avatarObjectKey(user.id, ext);
  } catch {
    throw new HttpError(400, "Could not save photo");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    await putObject(key, bytes, contentType);
  } catch (e) {
    throw new HttpError(500, storageError(e));
  }

  let image: string;
  try {
    image = publicUrl(key);
  } catch (e) {
    await deleteObjects([key]);
    throw new HttpError(500, storageError(e));
  }

  const previous = ownedAvatarKey(user.image, user.id);

  try {
    await auth.api.updateUser({
      body: { image },
      headers: c.req.raw.headers,
    });
  } catch (e) {
    await deleteObjects([key]);
    throw new HttpError(500, storageError(e));
  }

  if (previous && previous !== key) {
    await deleteObjects([previous]);
  }

  return c.json({ image });
});

profileRoutes.delete("/profile/avatar", requireUser, async (c) => {
  const session = await getSessionFromHeaders(c.req.raw.headers);
  if (!session) throw new HttpError(401, "Unauthorized");

  const previous = ownedAvatarKey(session.user.image, session.user.id);

  try {
    await auth.api.updateUser({
      body: { image: null },
      headers: c.req.raw.headers,
    });
  } catch (e) {
    throw new HttpError(500, storageError(e));
  }

  if (previous) await deleteObjects([previous]);
  return c.json({ image: null });
});
