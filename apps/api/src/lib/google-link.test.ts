import assert from "node:assert/strict";
import test from "node:test";
import {
  hasSessionCookie,
  parsePendingGoogleLink,
  pendingFromAccount,
  shouldHoldGoogleLink,
} from "./google-link";

test("shouldHoldGoogleLink only pauses a logged-out Google sign-in", () => {
  const base = {
    providerId: "google",
    path: "/callback/google",
    hasSessionCookie: false,
    hasPasswordAccount: true,
  };
  assert.equal(shouldHoldGoogleLink(base), true);
  assert.equal(shouldHoldGoogleLink({ ...base, providerId: "credential" }), false);
  assert.equal(shouldHoldGoogleLink({ ...base, hasSessionCookie: true }), false);
  assert.equal(shouldHoldGoogleLink({ ...base, hasPasswordAccount: false }), false);
  assert.equal(
    shouldHoldGoogleLink({ ...base, path: "/api/auth/google-link-confirm" }),
    false
  );
});

test("pending Google link keeps the account id that was just signed in", () => {
  const pending = pendingFromAccount({
    userId: "user-1",
    providerId: "google",
    accountId: "google-1",
    accessToken: "access",
    accessTokenExpiresAt: new Date("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(pending.accountId, "google-1");
  assert.equal(pending.accessTokenExpiresAt, "2026-10-01T00:00:00.000Z");
  assert.deepEqual(parsePendingGoogleLink(JSON.stringify(pending)), pending);
  assert.equal(parsePendingGoogleLink("{"), null);
});

test("hasSessionCookie recognizes the auth session cookie", () => {
  assert.equal(hasSessionCookie(undefined), false);
  assert.equal(hasSessionCookie("other=1"), false);
  assert.equal(
    hasSessionCookie("better-auth.session_token=abc"),
    true
  );
});
