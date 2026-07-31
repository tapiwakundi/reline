import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import { getSession } from "@/lib/session";
import {
  classifyContentType,
  maxBytesFor,
  objectKey,
  presignPut,
  publicUrl,
} from "@/lib/r2";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await db.query.memberships.findFirst({
    where: eq(memberships.userId, session.user.id),
  });
  if (!membership)
    return Response.json({ error: "No workspace" }, { status: 403 });

  const body = (await req.json()) as {
    filename?: string;
    contentType?: string;
    size?: number;
  };
  const { filename, contentType, size } = body;
  if (!filename || !contentType || !size || size <= 0) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const media = classifyContentType(contentType);
  if (!media) {
    return Response.json(
      { error: "Only images (jpeg, png, gif, webp, avif) and videos (mp4, webm, mov) are supported" },
      { status: 400 }
    );
  }

  if (size > maxBytesFor(media.kind)) {
    const limitMb = maxBytesFor(media.kind) / (1024 * 1024);
    return Response.json(
      { error: `${media.kind === "image" ? "Images" : "Videos"} must be under ${limitMb} MB` },
      { status: 400 }
    );
  }

  const key = objectKey(membership.workspaceId, media.ext);
  const uploadUrl = await presignPut(key, contentType, size);

  return Response.json({
    key,
    uploadUrl,
    publicUrl: publicUrl(key),
    kind: media.kind,
  });
}
