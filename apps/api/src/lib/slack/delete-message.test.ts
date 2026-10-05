import assert from "node:assert/strict";
import test from "node:test";
import { SlackApiError, type SlackClient } from "./client";
import { deleteSlackMessageWithTokens } from "./delete-message";

function client(deleteMessage: SlackClient["deleteMessage"]): SlackClient {
  return {
    lookupByEmail: async () => null,
    userInfo: async () => ({ email: null, name: null }),
    createPrivateChannel: async () => ({ id: "C" }),
    invite: async () => undefined,
    postMessage: async () => ({ ts: "1" }),
    postEphemeral: async () => undefined,
    archiveChannel: async () => undefined,
    unarchiveChannel: async () => undefined,
    deleteMessage,
  };
}

test("stops after the first token deletes the message", async () => {
  const used: string[] = [];
  await deleteSlackMessageWithTokens(
    client(async (token) => {
      used.push(token);
    }),
    { channelId: "C1", ts: "1.2", tokens: ["user", "bot"] }
  );
  assert.deepEqual(used, ["user"]);
});

test("tries the next token when the first cannot delete the message", async () => {
  const used: string[] = [];
  await deleteSlackMessageWithTokens(
    client(async (token) => {
      used.push(token);
      if (token === "user") throw new SlackApiError("cant_delete_message");
    }),
    { channelId: "C1", ts: "1.2", tokens: ["user", "bot", "bot"] }
  );
  assert.deepEqual(used, ["user", "bot"]);
});

test("treats a missing message as already deleted", async () => {
  const used: string[] = [];
  await deleteSlackMessageWithTokens(
    client(async (token) => {
      used.push(token);
      throw new SlackApiError("message_not_found");
    }),
    { channelId: "C1", ts: "1.2", tokens: ["user", "bot"] }
  );
  assert.deepEqual(used, ["user"]);
});

test("does not throw when every token is refused", async () => {
  await deleteSlackMessageWithTokens(
    client(async () => {
      throw new SlackApiError("cant_delete_message");
    }),
    { channelId: "C1", ts: "1.2", tokens: ["user", "bot"] }
  );
});

test("rethrows unexpected Slack errors", async () => {
  await assert.rejects(
    () =>
      deleteSlackMessageWithTokens(
        client(async () => {
          throw new SlackApiError("ratelimited");
        }),
        { channelId: "C1", ts: "1.2", tokens: ["bot"] }
      ),
    (error: unknown) =>
      error instanceof SlackApiError && error.slackError === "ratelimited"
  );
});
