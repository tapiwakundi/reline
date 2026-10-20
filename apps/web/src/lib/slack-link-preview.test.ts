import assert from "node:assert/strict";
import test from "node:test";
import {
  isSlackLinkExpandingAgent,
  slackLinkPreviewRewritePath,
} from "./slack-link-preview";

const SLACK = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";

test("slack crawler issue links rewrite to the preview page", () => {
  assert.equal(
    slackLinkPreviewRewritePath("/siimplytrade/issue/SMPL-62", SLACK),
    "/slack-link-preview/siimplytrade/SMPL-62"
  );
  assert.equal(
    slackLinkPreviewRewritePath("/siimplytrade/issue/SMPL-62/", SLACK),
    "/slack-link-preview/siimplytrade/SMPL-62"
  );
});

test("browsers and non-ticket urls stay on the normal page", () => {
  assert.equal(
    slackLinkPreviewRewritePath("/siimplytrade/issue/SMPL-62", "Mozilla/5.0"),
    null
  );
  assert.equal(
    slackLinkPreviewRewritePath(
      "/siimplytrade/issue/SMPL-62",
      "Slackbot 1.0 (+https://api.slack.com/robots)"
    ),
    null
  );
  assert.equal(slackLinkPreviewRewritePath("/siimplytrade/board", SLACK), null);
  assert.equal(slackLinkPreviewRewritePath("/login", SLACK), null);
  assert.equal(isSlackLinkExpandingAgent(null), false);
});
