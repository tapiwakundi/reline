import { createHash, timingSafeEqual } from "node:crypto";

const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

export function isValidCodeChallenge(value: string): boolean {
  return CHALLENGE_PATTERN.test(value);
}

export function verifyPkceS256(
  verifier: string,
  challenge: string
): boolean {
  if (!VERIFIER_PATTERN.test(verifier) || !CHALLENGE_PATTERN.test(challenge)) {
    return false;
  }
  const digest = createHash("sha256").update(verifier).digest("base64url");
  const left = Buffer.from(digest);
  const right = Buffer.from(challenge);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
