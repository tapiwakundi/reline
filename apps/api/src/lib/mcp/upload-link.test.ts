import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { signAuthorizeTicket } from "../oauth/request";
import { readUploadLink, receiveUpload, signUploadLink, uploadLinkUrl } from "./upload-link";

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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7]);
const NOW = 1_700_000_000_000;
const TEN_MINUTES = 10 * 60 * 1000;

const link = {
  key: "w1/mcp/u1/abc.png",
  contentType: "image/png",
  size: PNG.length,
  filename: "a.png",
};

describe("MCP upload links", () => {
  it("signs a link that reads back with the same file details for ten minutes", () => {
    const token = signUploadLink(link, NOW);
    assert.deepEqual(readUploadLink(token, NOW), { ...link, exp: NOW + TEN_MINUTES });
    assert.deepEqual(readUploadLink(token, NOW + TEN_MINUTES), { ...link, exp: NOW + TEN_MINUTES });
  });

  it("points the link at the web host, the same origin the connector already uses", () => {
    assert.equal(uploadLinkUrl("abc.def"), "https://app.example.com/api/mcp/uploads/abc.def");
  });

  it("rejects a link that has expired", () => {
    const token = signUploadLink(link, NOW);
    assert.equal(readUploadLink(token, NOW + TEN_MINUTES + 1), null);
  });

  it("rejects a link whose details were changed after signing", () => {
    const token = signUploadLink(link, NOW);
    const signature = token.slice(token.lastIndexOf(".") + 1);
    const forged = Buffer.from(
      JSON.stringify({ kind: "mcp-upload", ...link, key: "w1/mcp/u2/abc.png", exp: NOW + TEN_MINUTES })
    ).toString("base64url");
    assert.equal(readUploadLink(`${forged}.${signature}`, NOW), null);
  });

  it("rejects a malformed link", () => {
    const token = signUploadLink(link, NOW);
    assert.equal(readUploadLink("nonsense", NOW), null);
    assert.equal(readUploadLink(`${token.slice(0, token.lastIndexOf("."))}.`, NOW), null);
    assert.equal(readUploadLink("", NOW), null);
  });

  it("does not accept an OAuth authorize ticket signed with the same secret", () => {
    const ticket = signAuthorizeTicket({
      clientId: "reline",
      clientName: "Reline",
      redirectUri: "https://client.example.com/callback",
      codeChallenge: "challenge",
      scope: "write",
      resource: "https://app.example.com/api/mcp",
    });
    assert.equal(readUploadLink(ticket, NOW), null);
  });
});

describe("receiving an MCP upload", () => {
  function put(token: string, body: Buffer, headers: Record<string, string> = {}) {
    return new Request(`https://app.example.com/api/mcp/uploads/${token}`, {
      method: "PUT",
      headers,
      body,
    });
  }

  function storage() {
    const stored: { key: string; bytes: Buffer; contentType: string }[] = [];
    return {
      stored,
      put: async (key: string, bytes: Buffer | Uint8Array, contentType: string) => {
        stored.push({ key, bytes: Buffer.from(bytes), contentType });
      },
    };
  }

  it("stores the bytes under the link's key and returns the attachment to pass on", async () => {
    const token = signUploadLink(link, NOW);
    const store = storage();
    const response = await receiveUpload(put(token, PNG), token, { now: () => NOW, put: store.put });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      attachment: { upload: link.key, filename: "a.png" },
    });
    assert.equal(store.stored.length, 1);
    assert.equal(store.stored[0]!.key, link.key);
    assert.equal(store.stored[0]!.contentType, "image/png");
    assert.ok(store.stored[0]!.bytes.equals(PNG));
  });

  it("refuses an expired link without storing anything", async () => {
    const token = signUploadLink(link, NOW);
    const store = storage();
    const response = await receiveUpload(put(token, PNG), token, {
      now: () => NOW + TEN_MINUTES + 1,
      put: store.put,
    });
    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /expired/);
    assert.match(body.error, /create_attachment_upload/);
    assert.equal(store.stored.length, 0);
  });

  it("refuses a forged link without storing anything", async () => {
    const token = `${signUploadLink(link, NOW)}x`;
    const store = storage();
    const response = await receiveUpload(put(token, PNG), token, { now: () => NOW, put: store.put });
    assert.equal(response.status, 404);
    assert.equal(store.stored.length, 0);
  });

  it("refuses bytes that are not the declared type", async () => {
    const token = signUploadLink({ ...link, size: JPEG.length }, NOW);
    const store = storage();
    const response = await receiveUpload(put(token, JPEG), token, { now: () => NOW, put: store.put });
    assert.equal(response.status, 415);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /a\.png is image\/jpeg, not image\/png/);
    assert.equal(store.stored.length, 0);
  });

  it("refuses bytes that are not a supported file", async () => {
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    const token = signUploadLink({ ...link, size: html.length }, NOW);
    const store = storage();
    const response = await receiveUpload(put(token, html), token, { now: () => NOW, put: store.put });
    assert.equal(response.status, 415);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /not a supported file/);
    assert.equal(store.stored.length, 0);
  });

  it("refuses a body smaller than the declared size", async () => {
    const token = signUploadLink({ ...link, size: PNG.length + 5 }, NOW);
    const store = storage();
    const response = await receiveUpload(put(token, PNG), token, { now: () => NOW, put: store.put });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, new RegExp(`a\\.png is ${PNG.length} bytes, not the ${PNG.length + 5}`));
    assert.equal(store.stored.length, 0);
  });

  it("stops reading a body larger than the declared size", async () => {
    const token = signUploadLink({ ...link, size: PNG.length - 2 }, NOW);
    const store = storage();
    const response = await receiveUpload(put(token, PNG), token, { now: () => NOW, put: store.put });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /larger than the/);
    assert.equal(store.stored.length, 0);
  });

  it("refuses a Content-Length that disagrees with the declared size before reading the body", async () => {
    const token = signUploadLink(link, NOW);
    const store = storage();
    const response = await receiveUpload(
      put(token, PNG, { "content-length": String(PNG.length + 1) }),
      token,
      { now: () => NOW, put: store.put }
    );
    assert.equal(response.status, 400);
    assert.equal(store.stored.length, 0);
  });

  it("reports a storage failure so the client can retry", async () => {
    const token = signUploadLink(link, NOW);
    const response = await receiveUpload(put(token, PNG), token, {
      now: () => NOW,
      put: async () => {
        throw new Error("R2 is down");
      },
    });
    assert.equal(response.status, 500);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /Could not store a\.png/);
  });
});
