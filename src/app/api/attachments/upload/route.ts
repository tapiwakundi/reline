import { requireApiWorkspace } from "@/lib/api-auth";
import {
  classifyContentType,
  maxBytesFor,
  objectKey,
  publicUrl,
  putObject,
} from "@/lib/r2";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ctx = await requireApiWorkspace(req);
  if ("error" in ctx) return ctx.error;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  const contentType = file.type || "application/octet-stream";
  const size = file.size;
  const media = classifyContentType(contentType);
  if (!media) {
    return Response.json(
      {
        error:
          "Only images (jpeg, png, gif, webp, avif) and videos (mp4, webm, mov) are supported",
      },
      { status: 400 }
    );
  }

  if (size > maxBytesFor(media.kind)) {
    const limitMb = maxBytesFor(media.kind) / (1024 * 1024);
    return Response.json(
      {
        error: `${media.kind === "image" ? "Images" : "Videos"} must be under ${limitMb} MB`,
      },
      { status: 400 }
    );
  }

  const key = objectKey(ctx.workspace.id, media.ext);
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    await putObject(key, bytes, contentType);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }

  return Response.json({
    key,
    publicUrl: publicUrl(key),
    kind: media.kind,
    filename: file.name,
    contentType,
    size,
  });
}
