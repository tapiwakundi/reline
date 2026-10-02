import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePostHogHost,
  pathWithoutSearch,
  posthogAssetsHost,
  posthogDistinctIdFromCookie,
  posthogProxyTarget,
  posthogUiHost,
  resolvePostHogDistinctId,
  sanitizeDistinctId,
} from "./posthog";

test("sanitizeDistinctId rejects blank, huge, and control-character values", () => {
  assert.equal(sanitizeDistinctId("  user_1  "), "user_1");
  assert.equal(sanitizeDistinctId(""), undefined);
  assert.equal(sanitizeDistinctId("   "), undefined);
  assert.equal(sanitizeDistinctId(undefined), undefined);
  assert.equal(sanitizeDistinctId("a".repeat(201)), undefined);
  assert.equal(sanitizeDistinctId("user\nid"), undefined);
});

test("posthogDistinctIdFromCookie reads an encoded PostHog cookie", () => {
  const payload = encodeURIComponent(
    JSON.stringify({ distinct_id: "user_123", $sesid: [1, "abc", 2] })
  );
  const header = `theme=dark; ph_phc_exampletoken_posthog=${payload}; other=1`;
  assert.equal(posthogDistinctIdFromCookie(header), "user_123");
});

test("posthogDistinctIdFromCookie ignores a missing or broken cookie", () => {
  assert.equal(posthogDistinctIdFromCookie(undefined), undefined);
  assert.equal(posthogDistinctIdFromCookie("session=abc"), undefined);
  assert.equal(
    posthogDistinctIdFromCookie("ph_phc_tok_posthog=not-json"),
    undefined
  );
});

test("resolvePostHogDistinctId prefers the authenticated user", () => {
  const payload = encodeURIComponent(JSON.stringify({ distinct_id: "anon" }));
  assert.equal(
    resolvePostHogDistinctId({
      userId: "user_1",
      header: "from-header",
      cookie: `ph_phc_tok_posthog=${payload}`,
    }),
    "user_1"
  );
  assert.equal(
    resolvePostHogDistinctId({
      header: "from-header",
      cookie: `ph_phc_tok_posthog=${payload}`,
    }),
    "from-header"
  );
  assert.equal(
    resolvePostHogDistinctId({ cookie: `ph_phc_tok_posthog=${payload}` }),
    "anon"
  );
});

test("normalizePostHogHost falls back to US Cloud", () => {
  assert.equal(normalizePostHogHost(undefined), "https://us.i.posthog.com");
  assert.equal(normalizePostHogHost(" https://eu.i.posthog.com/ "), "https://eu.i.posthog.com");
  assert.equal(posthogUiHost("https://eu.i.posthog.com"), "https://eu.posthog.com");
  assert.equal(
    posthogAssetsHost("https://eu.i.posthog.com"),
    "https://eu-assets.i.posthog.com"
  );
});

test("posthogProxyTarget only forwards the analytics prefix", () => {
  assert.equal(
    posthogProxyTarget("/api/rline/e/", "?ip=0", "https://us.i.posthog.com"),
    "https://us.i.posthog.com/e/?ip=0"
  );
  assert.equal(
    posthogProxyTarget("/api/rline/static/array.js", "", "https://eu.i.posthog.com"),
    "https://eu-assets.i.posthog.com/static/array.js"
  );
  assert.equal(
    posthogProxyTarget("/api/rline/array/phc_x/config.js", "", "https://us.i.posthog.com"),
    "https://us-assets.i.posthog.com/array/phc_x/config.js"
  );
  assert.equal(posthogProxyTarget("/api/issues", "", "https://us.i.posthog.com"), null);
  assert.equal(
    posthogProxyTarget("/api/rline/../secrets", "", "https://us.i.posthog.com"),
    null
  );
});

test("pathWithoutSearch drops query strings and hashes", () => {
  assert.equal(pathWithoutSearch("/acme/issue/REL-1?token=secret"), "/acme/issue/REL-1");
  assert.equal(pathWithoutSearch("/login#section"), "/login");
  assert.equal(pathWithoutSearch("/board"), "/board");
});
