import assert from "node:assert/strict";
import test from "node:test";
import {
  googleErrorCallbackURL,
  googleLinkStep,
  oauthErrorMessage,
  safeInternalPath,
} from "./auth-redirect";

test("safeInternalPath keeps same-origin paths", () => {
  assert.equal(safeInternalPath(null), "/");
  assert.equal(safeInternalPath(""), "/");
  assert.equal(safeInternalPath("/"), "/");
  assert.equal(safeInternalPath("/invite/abc"), "/invite/abc");
  assert.equal(
    safeInternalPath("/invite/abc?from=signup"),
    "/invite/abc?from=signup"
  );
  assert.equal(safeInternalPath("  /board  "), "/board");
});

test("safeInternalPath rejects off-site redirects", () => {
  assert.equal(safeInternalPath("https://evil.example/phish"), "/");
  assert.equal(safeInternalPath("//evil.example"), "/");
  assert.equal(safeInternalPath("/\\evil.example"), "/");
  assert.equal(safeInternalPath("/%2f%2fevil.example"), "/");
  assert.equal(safeInternalPath("/%5Cevil"), "/");
  assert.equal(safeInternalPath("javascript:alert(1)"), "/");
});

test("googleErrorCallbackURL round-trips a safe next path", () => {
  const url = new URL(googleErrorCallbackURL("/invite/abc"), "http://localhost");
  assert.equal(url.pathname, "/login");
  assert.equal(url.searchParams.get("next"), "/invite/abc");
  assert.equal(safeInternalPath(url.searchParams.get("next")), "/invite/abc");

  const blocked = new URL(
    googleErrorCallbackURL("https://evil.example/phish"),
    "http://localhost"
  );
  assert.equal(blocked.searchParams.get("next"), "/");
});

test("googleLinkStep asks for the password before linking", () => {
  assert.equal(googleLinkStep("account_not_linked", false), "password");
  assert.equal(googleLinkStep("account_not_linked", true), "confirm");
  assert.equal(googleLinkStep("email_doesn't_match", true), "confirm");
  assert.equal(googleLinkStep("email_doesn't_match", false), null);
  assert.equal(
    googleLinkStep("account_already_linked_to_different_user", true),
    "conflict"
  );
  assert.equal(googleLinkStep("access_denied", false), null);
  assert.equal(googleLinkStep(null, true), null);
});

test("oauthErrorMessage stays specific for known Google failures", () => {
  assert.match(oauthErrorMessage("account_not_linked"), /password account/);
  assert.match(oauthErrorMessage("access_denied"), /cancelled/);
  assert.match(oauthErrorMessage("something_else"), /failed/i);
});
