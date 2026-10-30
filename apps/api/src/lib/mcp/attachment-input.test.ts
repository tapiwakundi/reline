import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_MCP_ATTACHMENT_BYTES,
  parseAttachmentUploads,
  type McpUpload,
  sniffContentType,
} from "./attachment-input";
import { parseIssueWriteArgs } from "./issue-fields";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function ftyp(major: string, ...compatible: string[]) {
  const brands = [major, "\0\0\0\0", ...compatible].join("");
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + brands.length);
  return Buffer.concat([size, Buffer.from(`ftyp${brands}`, "latin1"), Buffer.alloc(8)]);
}

describe("MCP attachment uploads", () => {
  it("decodes base64 and data URLs and reads the type from the bytes", () => {
    const parsed = parseAttachmentUploads([
      { filename: "shots/login.png", data: PNG.toString("base64") },
      { filename: "again.jpg", data: `data:image/jpeg;base64,${PNG.toString("base64")}` },
    ]);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const [first, second] = parsed.value as McpUpload[];
    assert.equal(first?.filename, "login.png");
    assert.equal(first?.contentType, "image/png");
    assert.equal(first?.ext, "png");
    assert.deepEqual(first?.bytes, PNG);
    // The label says jpeg but the bytes are png.
    assert.equal(second?.contentType, "image/png");
  });

  it("rejects files that are not supported images or videos", () => {
    const html = parseAttachmentUploads([
      { filename: "x.png", data: Buffer.from("<html>").toString("base64") },
    ]);
    assert.equal(html.ok, false);

    const badBase64 = parseAttachmentUploads([{ filename: "x.png", data: "not base64!" }]);
    assert.equal(badBase64.ok, false);

    const noName = parseAttachmentUploads([{ data: PNG.toString("base64") }]);
    assert.equal(noName.ok, false);

    const notList = parseAttachmentUploads({ filename: "x.png" });
    assert.equal(notList.ok, false);
  });

  it("limits the number and size of files", () => {
    const many = parseAttachmentUploads(
      Array.from({ length: 11 }, (_, i) => ({ filename: `${i}.png`, data: PNG.toString("base64") }))
    );
    assert.equal(many.ok, false);

    const big = Buffer.concat([PNG, Buffer.alloc(MAX_MCP_ATTACHMENT_BYTES)]);
    const tooBig = parseAttachmentUploads([{ filename: "big.png", data: big.toString("base64") }]);
    assert.equal(tooBig.ok, false);
  });

  it("tells mp4, mov, avif, and heic apart", () => {
    assert.equal(sniffContentType(ftyp("isom", "mp41")), "video/mp4");
    assert.equal(sniffContentType(ftyp("qt  ")), "video/quicktime");
    assert.equal(sniffContentType(ftyp("avif", "mif1")), "image/avif");
    assert.equal(sniffContentType(ftyp("mif1", "avif")), "image/avif");
    assert.equal(sniffContentType(ftyp("heic", "mif1")), undefined);
    assert.equal(sniffContentType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0])), "video/webm");
    assert.equal(sniffContentType(Buffer.from("GIF89a....")), "image/gif");
  });

  it("lets update_issue take attachments as its only change", () => {
    const parsed = parseIssueWriteArgs(
      { identifier: "REL-42", attachments: [{ filename: "a.png", data: PNG.toString("base64") }] },
      "update"
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.attachments?.length, 1);
  });
});
