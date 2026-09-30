import { S3Client, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";

export {
  IMAGE_TYPES,
  VIDEO_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_AVATAR_BYTES,
  MAX_ATTACHMENTS,
  classifyContentType,
  maxBytesFor,
  type AttachmentKind,
} from "@reline/shared";

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

/** Per-user prefix so a profile upload can only replace that user's own photo. */
export function avatarObjectKey(userId: string, ext: string) {
  return `${avatarPrefix(userId)}${nanoid()}.${ext}`;
}

export function avatarPrefix(userId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) {
    throw new Error("Invalid user");
  }
  return `avatars/${userId}/`;
}

export function logoObjectKey(workspaceId: string, ext: string) {
  return `${logoPrefix(workspaceId)}${nanoid()}.${ext}`;
}

export function logoPrefix(workspaceId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(workspaceId)) {
    throw new Error("Invalid workspace");
  }
  return `logos/${workspaceId}/`;
}

export function publicUrl(key: string) {
  return `${env("R2_PUBLIC_URL").replace(/\/$/, "")}/${key}`;
}

/** Object key when `url` is one of our public R2 URLs; otherwise null. */
export function keyFromPublicUrl(url: string): string | null {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!base || !url.startsWith(`${base}/`)) return null;
  let key = url.slice(base.length + 1);
  try {
    key = decodeURIComponent(key);
  } catch {
    return null;
  }
  if (!key || key.startsWith("/") || key.includes("..")) return null;
  return key;
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
