import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { comments, memberships, slackChannels, slackInstallations } from "@/db/schema";
import { liveSlackClient, type SlackClient } from "@/lib/slack/client";
import { slackAppConfigured, slackSigningSecret } from "@/lib/slack/config";
import { decryptSecret } from "@/lib/slack/crypto";
import {
  relineCommentIdFromSlackMetadata,
  slackMentionsToApp,
} from "@/lib/slack/mentions";
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
    metadata?: {
      event_type?: string;
      event_payload?: { comment_id?: unknown };
    };
  };
};

export function parseSlackEvent(raw: string): SlackEventPayload | null {
  try {
    return JSON.parse(raw) as SlackEventPayload;
  } catch {
    return null;
  }
}

async function claimMirroredComment(
  commentId: string,
  issueId: string,
  channelId: string,
  ts: string
): Promise<boolean> {
  const row = await db.query.comments.findFirst({
    where: and(eq(comments.id, commentId), eq(comments.issueId, issueId)),
    columns: { id: true },
  });
  if (!row) return false;
  try {
    await db
      .update(comments)
      .set({ slackChannelId: channelId, slackTs: ts })
      .where(eq(comments.id, row.id));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return true;
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let i = 0; i < 4 && current && typeof current === "object"; i++) {
    if ("code" in current && (current as { code?: string }).code === "23505") {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
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

  const mirroredId = relineCommentIdFromSlackMetadata(event.metadata);
  if (
    mirroredId &&
    (await claimMirroredComment(mirroredId, channel.issueId, event.channel, event.ts))
  ) {
    return;
  }

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
  const body = slackMentionsToApp(event.text ?? "", names).trim();
  if (!body) return;

  const pending = await db
    .select({ id: comments.id })
    .from(comments)
    .where(
      and(
        eq(comments.issueId, channel.issueId),
        eq(comments.authorId, author.id),
        eq(comments.source, "app"),
        isNull(comments.slackTs),
        eq(comments.body, body),
        gt(comments.createdAt, new Date(Date.now() - 2 * 60 * 1000))
      )
    )
    .orderBy(desc(comments.createdAt))
    .limit(1);
  if (pending[0] && (await claimMirroredComment(pending[0].id, channel.issueId, event.channel, event.ts))) {
    return;
  }

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
