import { SlackApiError, type SlackClient } from "./client";

const TRY_NEXT_TOKEN = new Set(["cant_delete_message"]);
const ALREADY_GONE = new Set(["message_not_found", "channel_not_found"]);

/**
 * Delete one Slack message. User-token posts can only be removed with that
 * user's token; bot posts need the bot token. Try each until one is allowed.
 */
export async function deleteSlackMessageWithTokens(
  client: SlackClient,
  opts: { channelId: string; ts: string; tokens: string[] }
): Promise<void> {
  const tokens = [...new Set(opts.tokens.filter(Boolean))];
  for (const token of tokens) {
    try {
      await client.deleteMessage(token, opts.channelId, opts.ts);
      return;
    } catch (error) {
      if (!(error instanceof SlackApiError)) throw error;
      if (ALREADY_GONE.has(error.slackError)) return;
      if (TRY_NEXT_TOKEN.has(error.slackError)) continue;
      throw error;
    }
  }
}
