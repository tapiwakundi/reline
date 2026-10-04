import assert from "node:assert/strict";
import test from "node:test";
import { slackChannelName, slackChannelNameWithSuffix } from "./channel-name";

test("slackChannelName slugs the issue key and title", () => {
  assert.equal(slackChannelName("REL-42", "Fix login"), "rel-42-fix-login");
  assert.equal(
    slackChannelName("REL-42", "Fix login!!! now"),
    "rel-42-fix-login-now"
  );
});

test("slackChannelName stays within 80 characters", () => {
  const name = slackChannelName("REL-9", "A".repeat(120));
  assert.ok(name.length <= 80);
  assert.ok(name.startsWith("rel-9-"));
});

test("slackChannelNameWithSuffix keeps the name unique and short", () => {
  const name = slackChannelNameWithSuffix("rel-42-fix-login", "ab12cd");
  assert.equal(name, "rel-42-fix-login-ab12cd");
  assert.ok(slackChannelNameWithSuffix("r".repeat(80), "zzzzzz").length <= 80);
});
