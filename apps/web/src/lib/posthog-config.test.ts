import assert from "node:assert/strict";
import test from "node:test";
import {
  isNextControlFlowError,
  shouldCaptureClientException,
} from "./posthog-config";

test("client exception capture skips errors the server already reported", () => {
  assert.equal(shouldCaptureClientException({}), true);
  assert.equal(shouldCaptureClientException({ digest: "abc" }), false);
});

test("next control-flow errors are not exceptions", () => {
  assert.equal(isNextControlFlowError(new Error("boom")), false);
  assert.equal(
    isNextControlFlowError({ digest: "NEXT_REDIRECT;replace;/login;307;" }),
    true
  );
  assert.equal(isNextControlFlowError({ digest: "NEXT_NOT_FOUND" }), true);
  assert.equal(
    isNextControlFlowError({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }),
    true
  );
});
