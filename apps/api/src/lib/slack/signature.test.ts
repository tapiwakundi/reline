import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifySlackSignature } from "./signature";

const secret = "signing-secret";
const rawBody = '{"type":"event_callback"}';
const timestamp = "1710000000";
const nowMs = 1710000000 * 1000;
const signature = `v0=${createHmac("sha256", secret)
  .update(`v0:${timestamp}:${rawBody}`)
  .digest("hex")}`;

test("verifySlackSignature accepts a fresh signed body", () => {
  assert.equal(
    verifySlackSignature({
      signingSecret: secret,
      timestamp,
      rawBody,
      signature,
      nowMs,
    }),
    true
  );
});

test("verifySlackSignature rejects a bad signature", () => {
  assert.equal(
    verifySlackSignature({
      signingSecret: secret,
      timestamp,
      rawBody,
      signature: "v0=deadbeef",
      nowMs,
    }),
    false
  );
});

test("verifySlackSignature rejects a stale timestamp", () => {
  assert.equal(
    verifySlackSignature({
      signingSecret: secret,
      timestamp,
      rawBody,
      signature,
      nowMs: nowMs + 6 * 60 * 1000,
    }),
    false
  );
});
