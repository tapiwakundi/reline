import assert from "node:assert/strict";
import test from "node:test";
import { readSlackOAuthState, signSlackOAuthState } from "./oauth";

const previous = process.env.BETTER_AUTH_SECRET;

test("Slack OAuth state signs and verifies workspace + user", () => {
  process.env.BETTER_AUTH_SECRET = "oauth-test-secret";
  const state = signSlackOAuthState({
    workspaceId: "ws_1",
    userId: "user_1",
    kind: "install",
  });
  const parsed = readSlackOAuthState(state);
  assert.equal(parsed?.workspaceId, "ws_1");
  assert.equal(parsed?.userId, "user_1");
  assert.equal(parsed?.kind, "install");
  assert.equal(readSlackOAuthState(`${state}x`), null);
  if (previous === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = previous;
});
