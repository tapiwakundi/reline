import assert from "node:assert/strict";
import test from "node:test";
import {
  internalPreviewAuthorized,
  isSlackLinkExpandingAgent,
  slackLinkPreviewCopy,
} from "./link-preview";

test("only Slack's link expander is treated as a preview crawl", () => {
  assert.equal(
    isSlackLinkExpandingAgent(
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"
    ),
    true
  );
  assert.equal(isSlackLinkExpandingAgent("Slackbot 1.0 (+https://api.slack.com/robots)"), false);
  assert.equal(isSlackLinkExpandingAgent("Mozilla/5.0"), false);
  assert.equal(isSlackLinkExpandingAgent(null), false);
});

test("preview auth requires the full internal key", () => {
  assert.equal(internalPreviewAuthorized(undefined, undefined), false);
  assert.equal(internalPreviewAuthorized("secret", undefined), false);
  assert.equal(internalPreviewAuthorized(undefined, "secret"), false);
  assert.equal(internalPreviewAuthorized("secret", "secre"), false);
  assert.equal(internalPreviewAuthorized("secret", "secret"), true);
});

test("crawler preview names the ticket instead of the login page", () => {
  const preview = slackLinkPreviewCopy({
    identifier: "SMPL-62",
    title: "Ship Slack previews",
    statusName: "In Progress",
    priority: 2,
    type: "bug",
    assigneeName: null,
    description: "The preview says **login**.",
  });
  assert.equal(preview.title, "SMPL-62 Ship Slack previews");
  assert.match(preview.description, /Bug · In Progress · High · Unassigned/);
  assert.match(preview.description, /The preview says login\./);
  assert.doesNotMatch(`${preview.title} ${preview.description}`, /Log in/);
});
