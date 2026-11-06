import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { checkReference, createAttachmentUploadTool } from "./attachment-upload";
import { readUploadLink } from "./upload-link";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const KEY = "w1/mcp/u1/abc.png";
const source = { uploadKey: KEY, filename: "a.png" };

function stored(bytes: Buffer, contentType: string, size = bytes.length) {
  return (async () => ({ bytes, size, contentType })) as never;
}

describe("MCP upload references", () => {
  it("accepts a file the same user uploaded, with the size from storage", async () => {
    const result = await checkReference("u1", "w1", source, stored(PNG, "image/png", 5000));
    assert.deepEqual(result, {
      ok: true,
      value: { key: KEY, filename: "a.png", contentType: "image/png", size: 5000 },
    });
  });

  it("rejects another user's, another workspace's, or a crafted key", async () => {
    const read = stored(PNG, "image/png");
    assert.equal((await checkReference("u2", "w1", source, read)).ok, false);
    assert.equal((await checkReference("u1", "w2", source, read)).ok, false);
    const climbing = { ...source, uploadKey: "w1/mcp/u1/../u2/abc.png" };
    assert.equal((await checkReference("u1", "w1", climbing, read)).ok, false);
    const other = { ...source, uploadKey: "w1/secret.png" };
    assert.equal((await checkReference("u1", "w1", other, read)).ok, false);
  });

  it("rejects a missing upload and bytes that do not match the declared type", async () => {
    const missing = await checkReference("u1", "w1", source, (async () => null) as never);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.match(missing.error, /has not been uploaded/);

    const html = Buffer.from("<html><script>alert(1)</script>");
    assert.equal((await checkReference("u1", "w1", source, stored(html, "image/png"))).ok, false);
    assert.equal((await checkReference("u1", "w1", source, stored(PNG, "image/jpeg"))).ok, false);
  });

  it("rejects a file over the limit", async () => {
    const result = await checkReference("u1", "w1", source, stored(PNG, "image/png", 1024 ** 4));
    assert.equal(result.ok, false);
  });
});

describe("create_attachment_upload", () => {
  const previousSecret = process.env.BETTER_AUTH_SECRET;
  const previousUrl = process.env.BETTER_AUTH_URL;

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "upload-test-secret";
    process.env.BETTER_AUTH_URL = "https://app.example.com";
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = previousSecret;
    if (previousUrl === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = previousUrl;
  });

  const inWorkspace = (async () => ({
    ok: true,
    value: { workspace: { id: "w1", slug: "acme" }, membership: {} },
  })) as never;

  it("returns an upload link on the web host that carries the file details", async () => {
    const result = await createAttachmentUploadTool(
      "u1",
      { filename: "clip.mp4", contentType: "video/mp4", size: 1234 },
      inWorkspace
    );
    assert.notEqual(result.isError, true);
    const text = result.content[0];
    assert.equal(text?.type, "text");
    const body = JSON.parse((text as { text: string }).text) as {
      uploadUrl: string;
      method: string;
      headers: Record<string, string>;
      expiresInSeconds: number;
      attachment: { upload: string; filename: string };
    };

    assert.match(body.uploadUrl, /^https:\/\/app\.example\.com\/api\/mcp\/uploads\/[^/]+$/);
    assert.equal(body.method, "PUT");
    assert.deepEqual(body.headers, { "Content-Type": "video/mp4", "Content-Length": "1234" });
    assert.equal(body.expiresInSeconds, 600);
    assert.match(body.attachment.upload, /^w1\/mcp\/u1\/[A-Za-z0-9_-]+\.mp4$/);
    assert.equal(body.attachment.filename, "clip.mp4");

    const token = body.uploadUrl.slice(body.uploadUrl.lastIndexOf("/") + 1);
    const link = readUploadLink(token);
    assert.ok(link, "the link in the URL should verify");
    assert.equal(link.key, body.attachment.upload);
    assert.equal(link.contentType, "video/mp4");
    assert.equal(link.size, 1234);
    assert.equal(link.filename, "clip.mp4");
  });

  it("lists every problem with the request at once", async () => {
    const result = await createAttachmentUploadTool(
      "u1",
      { contentType: "text/html", size: 0 },
      inWorkspace
    );
    assert.equal(result.isError, true);
    const text = (result.content[0] as { text: string }).text;
    assert.match(text, /filename/);
    assert.match(text, /not a supported file/);
    assert.match(text, /size/);
  });
});
