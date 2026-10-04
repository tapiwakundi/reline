import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, memberships, slackChannels, slackInstallations } from "@/db/schema";
import { liveSlackClient, type SlackClient } from "@/lib/slack/client";
import { slackAppConfigured, slackSigningSecret } from "@/lib/slack/config";
import { decryptSecret } from "@/lib/slack/crypto";
import { slackMentionsToApp } from "@/lib/slack/mentions";
import { verifySlackSignature } from "@/lib/slack/signature";
import { addComment } from "@/services/issues";
import {
  resolveRelineUserFromSlack,
  slackNamesByUserId,
} from "@/services/slack";

type SlackEventPayload = {
  type?: string;
  challenge?: string;
  team_id?: string;
  event?: {
    type?: string;
    subtype?: string;
    bot_id?: string;
    user?: string;
    text?: string;
    ts?: string;
    channel?: string;
    channel_type?: string;
  };
};

export function parseSlackEvent(raw: string): SlackEventPayload | null {
  try {
    return JSON.parse(raw) as SlackEventPayload;
  } catch {
    return null;
  }
}

export function slackEventAuthorized(opts: {
  timestamp: string;
  rawBody: string;
  signature: string;
}): boolean {
  if (!slackAppConfigured()) return false;
  return verifySlackSignature({
    signingSecret: slackSigningSecret(),
    timestamp: opts.timestamp,
    rawBody: opts.rawBody,
    signature: opts.signature,
  });
}

export async function handleSlackEvent(
  payload: SlackEventPayload,
  client: SlackClient = liveSlackClient
): Promise<void> {
  const event = payload.event;
  if (!event || payload.type !== "event_callback") return;
  if (event.type !== "message") return;
  if (event.subtype || event.bot_id) return;
  if (!event.channel || !event.ts || !event.user) return;

  const channel = await db.query.slackChannels.findFirst({
    where: eq(slackChannels.slackChannelId, event.channel),
  });
  if (!channel) return;

  const installation = await db.query.slackInstallations.findFirst({
    where: eq(slackInstallations.workspaceId, channel.workspaceId),
  });
  if (!installation) return;
  if (event.user === installation.botUserId) return;

  const already = await db.query.comments.findFirst({
    where: and(
      eq(comments.slackChannelId, event.channel),
      eq(comments.slackTs, event.ts)
    ),
    columns: { id: true },
  });
  if (already) return;

  const token = decryptSecret(installation.botTokenEncrypted);
  const author = await resolveRelineUserFromSlack({
    workspaceId: channel.workspaceId,
    slackUserId: event.user,
    token,
    client,
  });
  if (!author) {
    await client
      .postEphemeral(
        token,
        event.channel,
        event.user,
        "Reline could not match your Slack account to a workspace member. Use the same email as your Reline account, or connect Slack in Settings."
      )
      .catch(() => undefined);
    return;
  }

  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.workspaceId, channel.workspaceId),
      eq(memberships.userId, author.id)
    ),
    with: { workspace: true },
  });
  if (!membership) return;

  const names = await slackNamesByUserId(channel.workspaceId);
  const body = slackMentionsToApp(event.text ?? "", names);
  if (!body.trim()) return;

  await addComment(
    {
      user: author,
      membership,
      workspace: membership.workspace,
    },
    channel.issueId,
    body,
    undefined,
    null,
    {
      source: "slack",
      slackChannelId: event.channel,
      slackTs: event.ts,
    }
  );
}
