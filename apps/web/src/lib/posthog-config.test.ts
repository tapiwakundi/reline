import assert from "node:assert/strict";
import test from "node:test";
import {
  isNextControlFlowError,
  normalizePostHogHost,
  POSTHOG_PROXY_PATH,
  posthogAssetsHost,
  posthogRewrites,
  posthogUiHost,
  shouldCaptureClientException,
} from "./posthog-config";

test("normalizePostHogHost falls back to US Cloud and trims a trailing slash", () => {
  assert.equal(normalizePostHogHost(undefined), "https://us.i.posthog.com");
  assert.equal(
    normalizePostHogHost(" https://eu.i.posthog.com/ "),
    "https://eu.i.posthog.com"
  );
});

test("cloud hosts map to the app and asset origins", () => {
  assert.equal(posthogUiHost("https://us.i.posthog.com"), "https://us.posthog.com");
  assert.equal(posthogUiHost("https://eu.i.posthog.com"), "https://eu.posthog.com");
  assert.equal(
    posthogAssetsHost("https://eu.i.posthog.com"),
    "https://eu-assets.i.posthog.com"
  );
  assert.equal(
    posthogUiHost("https://posthog.example.com"),
    "https://posthog.example.com"
  );
  assert.equal(
    posthogAssetsHost("https://posthog.example.com"),
    "https://posthog.example.com"
  );
});

test("posthogRewrites stay on a first-party path blockers do not list", () => {
  assert.equal(POSTHOG_PROXY_PATH, "/rline");
  assert.deepEqual(posthogRewrites("https://eu.i.posthog.com"), [
    {
      source: "/rline/static/:path*",
      destination: "https://eu-assets.i.posthog.com/static/:path*",
    },
    {
      source: "/rline/array/:path*",
      destination: "https://eu-assets.i.posthog.com/array/:path*",
    },
    {
      source: "/rline/:path*",
      destination: "https://eu.i.posthog.com/:path*",
    },
  ]);
});

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
