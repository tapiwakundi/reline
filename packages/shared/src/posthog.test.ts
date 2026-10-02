import assert from "node:assert/strict";
import test from "node:test";
import {
  pathWithoutSearch,
  posthogDistinctIdFromCookie,
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

test("pathWithoutSearch drops query strings and hashes", () => {
  assert.equal(pathWithoutSearch("/acme/issue/REL-1?token=secret"), "/acme/issue/REL-1");
  assert.equal(pathWithoutSearch("/login#section"), "/login");
  assert.equal(pathWithoutSearch("/board"), "/board");
});
