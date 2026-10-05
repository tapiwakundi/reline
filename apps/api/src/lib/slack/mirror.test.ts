import assert from "node:assert/strict";
import test from "node:test";
import type { SlackClient } from "./client";
import { syncSlackAfterWrite } from "@/services/slack";

function stubClient(onPost: () => void): SlackClient {
  return {
    lookupByEmail: async () => null,
    userInfo: async () => ({ email: null, name: null }),
    createPrivateChannel: async () => ({ id: "C1" }),
    invite: async () => undefined,
    postMessage: async () => {
      onPost();
      return { ts: "1.0" };
    },
    postEphemeral: async () => undefined,
    archiveChannel: async () => undefined,
    unarchiveChannel: async () => undefined,
    deleteMessage: async () => undefined,
  };
}

test("addComment from Slack does not call chat.postMessage", async () => {
  let posted = false;
  await syncSlackAfterWrite(
    {
      source: "slack",
      workspaceId: "w",
      issueId: "i",
      actorId: "u",
      text: "Reply from Slack",
      mentionBefore: "",
      kind: "comment",
    },
    stubClient(() => {
      posted = true;
    })
  );
  assert.equal(posted, false);
});
