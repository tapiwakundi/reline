export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ATTACHMENTS = 10;

export type AttachmentKind = "image" | "video";

export function classifyContentType(
  contentType: string
): { kind: AttachmentKind; ext: string } | null {
  if (contentType in IMAGE_TYPES)
    return { kind: "image", ext: IMAGE_TYPES[contentType] };
  if (contentType in VIDEO_TYPES)
    return { kind: "video", ext: VIDEO_TYPES[contentType] };
  return null;
}

export function maxBytesFor(kind: AttachmentKind) {
  return kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
}
