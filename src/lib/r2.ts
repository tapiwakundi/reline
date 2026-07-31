import { S3Client, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";

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

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — configure R2 to enable attachments`);
  return value;
}

let client: S3Client | null = null;

function r2() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env("R2_ACCESS_KEY_ID"),
        secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return client;
}

export function objectKey(workspaceId: string, ext: string) {
  return `${workspaceId}/${nanoid()}.${ext}`;
}

export function publicUrl(key: string) {
  return `${env("R2_PUBLIC_URL").replace(/\/$/, "")}/${key}`;
}

export async function presignPut(key: string, contentType: string, size: number) {
  const command = new PutObjectCommand({
    Bucket: env("R2_BUCKET_NAME"),
    Key: key,
    ContentType: contentType,
    ContentLength: size,
  });
  return getSignedUrl(r2(), command, { expiresIn: 600 });
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
) {
  await r2().send(
    new PutObjectCommand({
      Bucket: env("R2_BUCKET_NAME"),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function deleteObjects(keys: string[]) {
  await Promise.allSettled(
    keys.map((key) =>
      r2().send(
        new DeleteObjectCommand({ Bucket: env("R2_BUCKET_NAME"), Key: key })
      )
    )
  );
}
