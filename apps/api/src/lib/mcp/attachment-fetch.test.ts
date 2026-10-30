import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { describe, it } from "node:test";
import { Readable } from "node:stream";
import {
  checkAttachmentUrl,
  fetchAttachmentUrl,
  isBlockedAddress,
  type AttachmentRequest,
} from "./attachment-fetch";
import { MAX_MCP_ATTACHMENT_BYTES } from "./attachment-input";
import { joinProblems, parseIssueWriteArgs } from "./issue-fields";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function reply(status: number, body: Buffer = Buffer.alloc(0), location?: string) {
  const stream = Readable.from(body.length ? [body] : []) as unknown as IncomingMessage;
  stream.statusCode = status;
  stream.headers = location ? { location } : {};
  return stream;
}

function server(...responses: IncomingMessage[]): { send: AttachmentRequest; urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    send: async (url) => {
      urls.push(url.toString());
      return responses.shift()!;
    },
  };
}

describe("MCP attachment URLs", () => {
  it("blocks internal addresses, including IPv4 written as IPv6", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "169.254.169.254",
      "192.168.0.1",
      "100.64.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
      "not an address",
    ]) {
      assert.equal(isBlockedAddress(address), true, address);
    }
    for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
      assert.equal(isBlockedAddress(address), false, address);
    }
  });

  it("accepts only public https URLs", () => {
    for (const url of [
      "http://example.com/a.png",
      "https://user:pw@example.com/a.png",
      "https://example.com:8443/a.png",
      "https://localhost/a.png",
      "https://127.0.0.1/a.png",
      "https://[::1]/a.png",
      "https://169.254.169.254/latest/meta-data",
      "file:///etc/passwd",
      "not a url",
    ]) {
      assert.equal(checkAttachmentUrl(url), null, url);
    }
    assert.ok(checkAttachmentUrl("https://example.com/a.png"));
  });

  it("downloads a file and takes its name from the URL", async () => {
    const { send } = server(reply(200, PNG));
    const result = await fetchAttachmentUrl({ url: "https://example.com/shots/login%20page.png" }, send);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.filename, "login page.png");
    assert.equal(result.value.contentType, "image/png");
  });

  it("re-checks every redirect", async () => {
    const internal = server(reply(302, undefined, "https://169.254.169.254/latest/meta-data"));
    const blocked = await fetchAttachmentUrl({ url: "https://example.com/a.png" }, internal.send);
    assert.equal(blocked.ok, false);
    assert.equal(internal.urls.length, 1);

    const downgrade = server(reply(301, undefined, "http://example.com/a.png"));
    assert.equal((await fetchAttachmentUrl({ url: "https://example.com/a.png" }, downgrade.send)).ok, false);

    const loop = server(
      ...Array.from({ length: 5 }, () => reply(302, undefined, "https://example.com/a.png"))
    );
    assert.equal((await fetchAttachmentUrl({ url: "https://example.com/a.png" }, loop.send)).ok, false);

    const fine = server(reply(302, undefined, "/b.png"), reply(200, PNG));
    assert.equal((await fetchAttachmentUrl({ url: "https://example.com/a.png" }, fine.send)).ok, true);
    assert.equal(fine.urls[1], "https://example.com/b.png");
  });

  it("rejects error responses, unsupported files, and oversized files", async () => {
    assert.equal((await fetchAttachmentUrl({ url: "https://example.com/a" }, server(reply(404)).send)).ok, false);
    assert.equal(
      (await fetchAttachmentUrl({ url: "https://example.com/a" }, server(reply(200, Buffer.from("<html>"))).send)).ok,
      false
    );
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_MCP_ATTACHMENT_BYTES)]);
    assert.equal((await fetchAttachmentUrl({ url: "https://example.com/a" }, server(reply(200, big)).send)).ok, false);
  });
});

describe("MCP validation in one pass", () => {
  it("reports every problem at once", () => {
    const parsed = parseIssueWriteArgs(
      {
        priority: "Sometimes",
        type: "Nonsense",
        labels: "Auth",
        attachments: [
          { filename: "a.png", data: "not base64!" },
          { data: PNG.toString("base64") },
          { url: "https://example.com/a.png", data: PNG.toString("base64") },
        ],
      },
      "create"
    );
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.match(parsed.error, /^7 problems:/);
    for (const text of [/Priority/, /Type/, /Labels/, /a\.png/, /needs a filename/, /only one of/, /Title is required/]) {
      assert.match(parsed.error, text);
    }
  });

  it("keeps a single problem as a plain sentence and drops duplicates", () => {
    assert.equal(joinProblems(["Nope."]), "Nope.");
    assert.equal(joinProblems(["Nope.", "Nope."]), "Nope.");
  });

  it("accepts url and upload attachments without base64", () => {
    const parsed = parseIssueWriteArgs(
      {
        title: "Hi",
        attachments: [
          { url: "https://example.com/a.png" },
          { upload: "w/mcp/u/x.png", filename: "x.png" },
        ],
      },
      "create"
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.value.attachments, [
      { url: "https://example.com/a.png" },
      { uploadKey: "w/mcp/u/x.png", filename: "x.png" },
    ]);
  });
});
