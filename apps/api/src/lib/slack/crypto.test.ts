import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecret, encryptSecret } from "./crypto";

const previous = process.env.SLACK_TOKEN_ENCRYPTION_KEY;

test("encryptSecret round-trips a bot token", () => {
  process.env.SLACK_TOKEN_ENCRYPTION_KEY = "test-slack-token-key";
  const packed = encryptSecret("xoxb-secret-token");
  assert.notEqual(packed, "xoxb-secret-token");
  assert.equal(decryptSecret(packed), "xoxb-secret-token");
  if (previous === undefined) delete process.env.SLACK_TOKEN_ENCRYPTION_KEY;
  else process.env.SLACK_TOKEN_ENCRYPTION_KEY = previous;
});

test("decryptSecret rejects a tampered payload", () => {
  process.env.SLACK_TOKEN_ENCRYPTION_KEY = "test-slack-token-key";
  const packed = encryptSecret("xoxb-secret-token");
  const [iv, tag, data] = packed.split(".");
  const flipped = (data ?? "").startsWith("A") ? `B${data?.slice(1)}` : `A${data?.slice(1)}`;
  assert.throws(() => decryptSecret(`${iv}.${tag}.${flipped}`));
  if (previous === undefined) delete process.env.SLACK_TOKEN_ENCRYPTION_KEY;
  else process.env.SLACK_TOKEN_ENCRYPTION_KEY = previous;
});
