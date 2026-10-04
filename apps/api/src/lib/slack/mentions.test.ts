import assert from "node:assert/strict";
import test from "node:test";
import type { Member } from "@reline/shared";
import {
  appMentionsToSlack,
  formatSlackIssueMessage,
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
