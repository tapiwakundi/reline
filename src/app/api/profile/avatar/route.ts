import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/session";
import {
  IMAGE_TYPES,
  MAX_AVATAR_BYTES,
  avatarObjectKey,
  avatarPrefix,
  deleteObjects,
  keyFromPublicUrl,
  publicUrl,
  putObject,
} from "@/lib/r2";

export const runtime = "nodejs";

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

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    return Response.json(
      { error: "Photo must be under 5 MB" },
      { status: 400 }
    );
  }

  let key: string;
  try {
    key = avatarObjectKey(session.user.id, ext);
  } catch {
    return Response.json({ error: "Could not save photo" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    await putObject(key, bytes, contentType);
  } catch (e) {
    return Response.json({ error: storageError(e) }, { status: 500 });
  }

  let image: string;
  try {
    image = publicUrl(key);
  } catch (e) {
    await deleteObjects([key]);
    return Response.json({ error: storageError(e) }, { status: 500 });
  }

  const previous = ownedAvatarKey(session.user.image, session.user.id);

  try {
    await auth.api.updateUser({
      body: { image },
      headers: await headers(),
    });
  } catch (e) {
    await deleteObjects([key]);
    return Response.json({ error: storageError(e) }, { status: 500 });
  }

  if (previous && previous !== key) {
    await deleteObjects([previous]);
  }

  return Response.json({ image });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const previous = ownedAvatarKey(session.user.image, session.user.id);

  try {
    await auth.api.updateUser({
      body: { image: null },
      headers: await headers(),
    });
  } catch (e) {
    return Response.json({ error: storageError(e) }, { status: 500 });
  }

  if (previous) await deleteObjects([previous]);

  return Response.json({ image: null });
}
