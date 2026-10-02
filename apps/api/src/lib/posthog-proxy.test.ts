import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { proxyPostHogRequest } from "./posthog-proxy";

test("proxyPostHogRequest forwards the body and drops cookies", async () => {
  const seen: { url?: string; cookie?: string | undefined; body?: string } = {};
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      seen.url = req.url;
      seen.cookie = req.headers.cookie;
      seen.body = Buffer.concat(chunks).toString("utf8");
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"status":"Ok"}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const previous = process.env.POSTHOG_HOST;
  process.env.POSTHOG_HOST = `http://127.0.0.1:${address.port}`;

  try {
    const response = await proxyPostHogRequest(
      new Request("http://app.test/api/rline/e/?ip=0", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "session=secret",
          authorization: "Bearer secret",
        },
        body: '{"event":"test"}',
      })
    );
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '{"status":"Ok"}');
    assert.equal(seen.url, "/e/?ip=0");
    assert.equal(seen.cookie, undefined);
    assert.equal(seen.body, '{"event":"test"}');
  } finally {
    if (previous === undefined) delete process.env.POSTHOG_HOST;
    else process.env.POSTHOG_HOST = previous;
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
});
