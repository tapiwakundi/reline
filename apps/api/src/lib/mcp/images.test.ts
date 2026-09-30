import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { embedImages, isAllowedAttachmentUrl } from "./images";
import type { McpAttachment } from "./types";

const shot: McpAttachment = {
  id: "att-1",
  filename: "shot.png",
  contentType: "image/png",
  size: 5,
  kind: "image",
  url: "https://files.example.com/acme/shot.png",
};

describe("attachment embedding", () => {
  it("only fetches URLs on the configured attachment origin", () => {
    process.env.R2_PUBLIC_URL = "https://files.example.com";
    assert.equal(isAllowedAttachmentUrl(shot.url!), true);
    assert.equal(isAllowedAttachmentUrl("https://evil.example/shot.png"), false);
    assert.equal(
      isAllowedAttachmentUrl("https://user:pass@files.example.com/shot.png"),
      false
    );
    delete process.env.R2_PUBLIC_URL;
    assert.equal(isAllowedAttachmentUrl(shot.url!), false);
  });

  it("returns image content for an allowed file and skips other hosts", async () => {
    process.env.R2_PUBLIC_URL = "https://files.example.com";
    const png = Buffer.from([1, 2, 3, 4, 5]);
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url !== shot.url) throw new Error(`unexpected fetch ${url}`);
      return new Response(png, { status: 200, headers: { "content-type": "image/png" } });
    };

    const blocks = await embedImages([shot], fetchImpl);
    assert.equal(blocks[0]?.type, "text");
    assert.equal(blocks[1]?.type, "image");
    if (blocks[1]?.type === "image") {
      assert.equal(blocks[1].mimeType, "image/png");
      assert.equal(blocks[1].data, png.toString("base64"));
    }

    const blocked = await embedImages(
      [{ ...shot, url: "https://evil.example/shot.png" }],
      async () => {
        throw new Error("should not fetch");
      }
    );
    assert.equal(blocked[0]?.type, "text");
    assert.match(
      blocked[0] && blocked[0].type === "text" ? blocked[0].text : "",
      /Could not embed/
    );
    delete process.env.R2_PUBLIC_URL;
  });
});
