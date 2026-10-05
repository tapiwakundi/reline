import assert from "node:assert/strict";
import test from "node:test";
import type { Member } from "@reline/shared";
import {
  appMentionsToSlack,
  formatSlackChannelOpenedMessage,
  formatSlackIssueMessage,
  relineCommentIdFromSlackMetadata,
  slackMentionsToApp,
} from "./mentions";

const ada: Member = {
  id: "ada",
  name: "Ada",
  email: "ada@example.com",
  image: null,
};

test("appMentionsToSlack replaces known @names with Slack ids", () => {
  const ids = new Map([["ada", "U123"]]);
  assert.equal(
    appMentionsToSlack("Hey @Ada, please look", [ada], ids),
    "Hey <@U123>, please look"
  );
  assert.equal(
    appMentionsToSlack("Hey @Ada, please look", [ada], new Map()),
    "Hey @Ada, please look"
  );
});

test("slackMentionsToApp turns Slack mentions back into @names", () => {
  const names = new Map([["U123", "Ada"]]);
  assert.equal(
    slackMentionsToApp("Hey <@U123>, please look", names),
    "Hey @Ada, please look"
  );
  assert.equal(
    slackMentionsToApp("Hey <@U123|ada>, please look", names),
    "Hey @Ada, please look"
  );
  assert.equal(slackMentionsToApp("Hey <@U999>", names), "Hey <@U999>");
});

test("formatSlackIssueMessage includes the key, title, and link", () => {
  const text = formatSlackIssueMessage({
    identifier: "REL-42",
    title: "Fix login",
    url: "https://app.example.com/acme/issue/REL-42",
    body: "Hey <@U123>",
  });
  assert.match(text, /\*REL-42\*/);
  assert.match(text, /Fix login/);
  assert.match(text, /<https:\/\/app.example.com\/acme\/issue\/REL-42\|Open in Reline>/);
  assert.match(text, /Hey <@U123>/);
});

test("formatSlackChannelOpenedMessage puts the description under the key and title", () => {
  const url = "https://app.example.com/acme/issue/REL-42";
  const text = formatSlackChannelOpenedMessage({
    identifier: "REL-42",
    title: "Fix login",
    url,
    description: "Users cannot sign in with SSO.",
  });
  assert.equal(
    text,
    `*REL-42* Fix login\nUsers cannot sign in with SSO.\n\n<${url}|Open in Reline>`
  );
});

test("formatSlackChannelOpenedMessage skips a blank description", () => {
  const url = "https://app.example.com/acme/issue/REL-42";
  const text = formatSlackChannelOpenedMessage({
    identifier: "REL-42",
    title: "Fix login",
    url,
    description: "  \n",
  });
  assert.equal(text, `*REL-42* Fix login\n<${url}|Open in Reline>`);
});

test("relineCommentIdFromSlackMetadata reads only reline comment markers", () => {
  assert.equal(
    relineCommentIdFromSlackMetadata({
      event_type: "reline_comment",
      event_payload: { comment_id: "c1" },
    }),
    "c1"
  );
  assert.equal(
    relineCommentIdFromSlackMetadata({
      event_type: "other",
      event_payload: { comment_id: "c1" },
    }),
    null
  );
  assert.equal(relineCommentIdFromSlackMetadata(undefined), null);
});
