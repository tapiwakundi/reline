import assert from "node:assert/strict";
import test from "node:test";
import { shouldSyncSlackWrite } from "./policy";

test("slack-sourced comments do not post back to Slack", () => {
  assert.equal(
    shouldSyncSlackWrite({
      source: "slack",
      kind: "comment",
      hasChannel: true,
      newMentionCount: 1,
      resolvedCount: 1,
    }),
    false
  );
});

test("app comments post once a channel exists, even without a new mention", () => {
  assert.equal(
    shouldSyncSlackWrite({
      source: "app",
      kind: "comment",
      hasChannel: true,
      newMentionCount: 0,
      resolvedCount: 0,
    }),
    true
  );
});

test("the first mention creates a channel only when someone resolves in Slack", () => {
  assert.equal(
    shouldSyncSlackWrite({
      kind: "comment",
      hasChannel: false,
      newMentionCount: 1,
      resolvedCount: 1,
    }),
    true
  );
  assert.equal(
    shouldSyncSlackWrite({
      kind: "comment",
      hasChannel: false,
      newMentionCount: 1,
      resolvedCount: 0,
    }),
    false
  );
});

test("description edits post only when they add a mention", () => {
  assert.equal(
    shouldSyncSlackWrite({
      kind: "description",
      hasChannel: true,
      newMentionCount: 0,
      resolvedCount: 1,
    }),
    false
  );
  assert.equal(
    shouldSyncSlackWrite({
      kind: "description",
      hasChannel: true,
      newMentionCount: 1,
      resolvedCount: 0,
    }),
    true
  );
});
