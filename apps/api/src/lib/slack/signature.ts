import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 60 * 5;

export function verifySlackSignature(opts: {
  signingSecret: string;
  timestamp: string;
  rawBody: string;
  signature: string;
  nowMs?: number;
}): boolean {
  const ts = Number(opts.timestamp);
  if (!Number.isFinite(ts) || !opts.signature.startsWith("v0=")) return false;

  const nowSeconds = (opts.nowMs ?? Date.now()) / 1000;
  if (Math.abs(nowSeconds - ts) > MAX_AGE_SECONDS) return false;

  const base = `v0:${opts.timestamp}:${opts.rawBody}`;
  const digest = createHmac("sha256", opts.signingSecret)
    .update(base)
    .digest("hex");
  const expected = Buffer.from(`v0=${digest}`);
  const actual = Buffer.from(opts.signature);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
