import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { isValidCodeChallenge, verifyPkceS256 } from "./pkce";

function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

describe("PKCE S256", () => {
  it("accepts the matching verifier", () => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = challengeFor(verifier);
    assert.equal(isValidCodeChallenge(challenge), true);
    assert.equal(verifyPkceS256(verifier, challenge), true);
    const other = randomBytes(32).toString("base64url");
    assert.equal(verifyPkceS256(other, challenge), false);
  });

  it("rejects a short verifier or challenge", () => {
    assert.equal(isValidCodeChallenge("short"), false);
    assert.equal(verifyPkceS256("short", "a".repeat(43)), false);
  });
});
