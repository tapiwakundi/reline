import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkReference } from "./attachment-upload";

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
