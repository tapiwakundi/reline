import { and, eq } from "drizzle-orm";
import { mentionsAdded, resolveMentions, wsPath, type Member } from "@reline/shared";
import { db } from "@/db";
import {
  comments,
  issues,
  memberships,
  slackChannels,
  slackInstallations,
  slackUserLinks,
  user,
  workspaces,
} from "@/db/schema";
import { HttpError, type WorkspaceContext } from "@/lib/context";
import { slackChannelName, slackChannelNameWithSuffix } from "@/lib/slack/channel-name";
import {
  exchangeSlackInstallCode,
  exchangeSlackUserCode,
  liveSlackClient,
  SlackApiError,
  type SlackClient,
} from "@/lib/slack/client";
import {
  publicAppUrl,
  slackAppConfigured,
  slackClientId,
  slackRedirectUri,
} from "@/lib/slack/config";
import { decryptSecret, encryptSecret } from "@/lib/slack/crypto";
import {
  appMentionsToSlack,
  formatSlackAttributedComment,
  formatSlackIssueMessage,
} from "@/lib/slack/mentions";
import { readSlackOAuthState, signSlackOAuthState } from "@/lib/slack/oauth";
import { shouldSyncSlackWrite, type SlackWriteKind } from "@/lib/slack/policy";

export type SlackSettingsStatus = {
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  linked: boolean;
  /** This member granted Reline permission to post Slack messages as them. */
  postsAsUser: boolean;
  canInstall: boolean;
};

export function getSlackSettingsStatus(
  ctx: WorkspaceContext,
  installation: { teamName: string } | null,
  linked: boolean,
  postsAsUser: boolean
): SlackSettingsStatus {
  return {
    configured: slackAppConfigured(),
    connected: Boolean(installation),
    teamName: installation?.teamName ?? null,
    linked,
    postsAsUser,
    canInstall: ctx.membership.role === "owner",
  };
}

export async function loadSlackStatus(
  ctx: WorkspaceContext
): Promise<SlackSettingsStatus> {
  const [installation, link] = await Promise.all([
    db.query.slackInstallations.findFirst({
      where: eq(slackInstallations.workspaceId, ctx.workspace.id),
      columns: { teamName: true },
    }),
    db.query.slackUserLinks.findFirst({
      where: and(
        eq(slackUserLinks.workspaceId, ctx.workspace.id),
        eq(slackUserLinks.userId, ctx.user.id)
      ),
      columns: { id: true, userTokenEncrypted: true },
    }),
  ]);
  return getSlackSettingsStatus(
    ctx,
    installation ?? null,
    Boolean(link),
    Boolean(link?.userTokenEncrypted)
  );
}

function requireConfigured() {
  if (!slackAppConfigured()) {
    throw new HttpError(400, "Slack is not configured on this server");
  }
}

function requireOwner(ctx: WorkspaceContext) {
  if (ctx.membership.role !== "owner") {
    throw new HttpError(403, "Only the workspace owner can connect Slack");
  }
}

export function slackAuthorizeUrl(kind: "install" | "user", state: string): string {
  const redirect = encodeURIComponent(slackRedirectUri(kind));
  const st = encodeURIComponent(state);
  const client = encodeURIComponent(slackClientId());
  if (kind === "install") {
    const scopes = encodeURIComponent(
      "groups:write,groups:read,groups:history,chat:write,users:read,users:read.email"
    );
    return `https://slack.com/oauth/v2/authorize?client_id=${client}&scope=${scopes}&redirect_uri=${redirect}&state=${st}`;
  }
  const userScope = encodeURIComponent("chat:write");
  return `https://slack.com/oauth/v2/authorize?client_id=${client}&user_scope=${userScope}&redirect_uri=${redirect}&state=${st}`;
}

export async function startSlackInstall(ctx: WorkspaceContext): Promise<string> {
  requireConfigured();
  requireOwner(ctx);
  const state = signSlackOAuthState({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    kind: "install",
  });
  return slackAuthorizeUrl("install", state);
}

export async function startSlackUserLink(ctx: WorkspaceContext): Promise<string> {
  requireConfigured();
  const installation = await db.query.slackInstallations.findFirst({
    where: eq(slackInstallations.workspaceId, ctx.workspace.id),
    columns: { id: true },
  });
  if (!installation) {
    throw new HttpError(400, "Ask the workspace owner to connect Slack first");
  }
  const state = signSlackOAuthState({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    kind: "user",
  });
  return slackAuthorizeUrl("user", state);
}

export async function workspaceSlugForState(
  state: string | undefined
): Promise<string | null> {
  const parsed = readSlackOAuthState(state);
  if (!parsed) return null;
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, parsed.workspaceId),
    columns: { slug: true },
  });
  return workspace?.slug ?? null;
}

function slackSettingsRedirect(slug: string, query: string): string {
  return `${publicAppUrl()}${wsPath(slug, `/settings/slack`)}?${query}`;
}

export async function completeSlackInstall(opts: {
  code?: string;
  state?: string;
  error?: string;
}): Promise<string> {
  requireConfigured();
  const parsed = readSlackOAuthState(opts.state);
  if (!parsed || parsed.kind !== "install") {
    throw new HttpError(400, "Invalid Slack install state");
  }
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, parsed.workspaceId),
  });
  if (!workspace) throw new HttpError(404, "Workspace not found");

  if (opts.error) {
    throw new HttpError(400, "Slack install was cancelled");
  }
  if (!opts.code) throw new HttpError(400, "Missing Slack authorization code");

  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.workspaceId, workspace.id),
      eq(memberships.userId, parsed.userId)
    ),
  });
  if (!membership || membership.role !== "owner") {
    throw new HttpError(403, "Only the workspace owner can connect Slack");
  }

  const granted = await exchangeSlackInstallCode({
    code: opts.code,
    redirectUri: slackRedirectUri("install"),
  });

  const now = new Date();
  const values = {
    workspaceId: workspace.id,
    teamId: granted.teamId,
    teamName: granted.teamName,
    botUserId: granted.botUserId,
    botTokenEncrypted: encryptSecret(granted.accessToken),
    installedBy: parsed.userId,
    updatedAt: now,
  };

  await db
    .insert(slackInstallations)
    .values(values)
    .onConflictDoUpdate({
      target: slackInstallations.workspaceId,
      set: {
        teamId: values.teamId,
        teamName: values.teamName,
        botUserId: values.botUserId,
        botTokenEncrypted: values.botTokenEncrypted,
        installedBy: values.installedBy,
        updatedAt: now,
      },
    });

  if (granted.authedUserId) {
    try {
      await upsertUserLink(workspace.id, parsed.userId, granted.authedUserId);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  return slackSettingsRedirect(workspace.slug, "installed=1");
}

export async function completeSlackUserLink(opts: {
  code?: string;
  state?: string;
  error?: string;
}): Promise<string> {
  requireConfigured();
  const parsed = readSlackOAuthState(opts.state);
  if (!parsed || parsed.kind !== "user") {
    throw new HttpError(400, "Invalid Slack link state");
  }
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, parsed.workspaceId),
  });
  if (!workspace) throw new HttpError(404, "Workspace not found");

  if (opts.error) throw new HttpError(400, "Slack connect was cancelled");
  if (!opts.code) throw new HttpError(400, "Missing Slack authorization code");

  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.workspaceId, workspace.id),
      eq(memberships.userId, parsed.userId)
    ),
  });
  if (!membership) throw new HttpError(403, "Not a member of this workspace");

  const installation = await db.query.slackInstallations.findFirst({
    where: eq(slackInstallations.workspaceId, workspace.id),
  });
  if (!installation) {
    throw new HttpError(400, "Ask the workspace owner to connect Slack first");
  }

  const identity = await exchangeSlackUserCode({
    code: opts.code,
    redirectUri: slackRedirectUri("user"),
  });
  if (identity.teamId !== installation.teamId) {
    throw new HttpError(400, "That Slack account is from a different workspace");
  }

  await upsertUserLink(
    workspace.id,
    parsed.userId,
    identity.slackUserId,
    encryptSecret(identity.accessToken)
  );
  return slackSettingsRedirect(workspace.slug, "linked=1");
}

export async function disconnectSlack(ctx: WorkspaceContext): Promise<void> {
  requireOwner(ctx);
  await db
    .delete(slackInstallations)
    .where(eq(slackInstallations.workspaceId, ctx.workspace.id));
  await db
    .delete(slackUserLinks)
    .where(eq(slackUserLinks.workspaceId, ctx.workspace.id));
  await db
    .delete(slackChannels)
    .where(eq(slackChannels.workspaceId, ctx.workspace.id));
}

async function upsertUserLink(
  workspaceId: string,
  userId: string,
  slackUserId: string,
  userTokenEncrypted?: string
) {
  await db
    .insert(slackUserLinks)
    .values({
      workspaceId,
      userId,
      slackUserId,
      userTokenEncrypted: userTokenEncrypted ?? null,
    })
    .onConflictDoUpdate({
      target: [slackUserLinks.workspaceId, slackUserLinks.userId],
      set: {
        slackUserId,
        ...(userTokenEncrypted ? { userTokenEncrypted } : {}),
      },
    });
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

async function workspaceMembers(workspaceId: string): Promise<Member[]> {
  const rows = await db.query.memberships.findMany({
    where: eq(memberships.workspaceId, workspaceId),
    with: { user: true },
  });
  return rows.map((row) => ({
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    image: row.user.image ?? null,
  }));
}

async function resolveSlackUserId(opts: {
  workspaceId: string;
  token: string;
  member: Member;
  client: SlackClient;
}): Promise<string | null> {
  const existing = await db.query.slackUserLinks.findFirst({
    where: and(
      eq(slackUserLinks.workspaceId, opts.workspaceId),
      eq(slackUserLinks.userId, opts.member.id)
    ),
  });
  if (existing) return existing.slackUserId;

  const slackUserId = await opts.client.lookupByEmail(opts.token, opts.member.email);
  if (!slackUserId) return null;
  try {
    await upsertUserLink(opts.workspaceId, opts.member.id, slackUserId);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return slackUserId;
}

async function resolveSlackIds(opts: {
  workspaceId: string;
  token: string;
  members: Member[];
  client: SlackClient;
}): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const member of opts.members) {
    if (ids.has(member.id)) continue;
    const slackId = await resolveSlackUserId({
      workspaceId: opts.workspaceId,
      token: opts.token,
      member,
      client: opts.client,
    });
    if (slackId) ids.set(member.id, slackId);
  }
  return ids;
}

async function ensureIssueChannel(opts: {
  workspaceId: string;
  issueId: string;
  identifier: string;
  title: string;
  token: string;
  client: SlackClient;
}): Promise<string> {
  const existing = await db.query.slackChannels.findFirst({
    where: eq(slackChannels.issueId, opts.issueId),
  });
  if (existing) return existing.slackChannelId;

  const base = slackChannelName(opts.identifier, opts.title);
  let name = base;
  let created: { id: string } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      created = await opts.client.createPrivateChannel(opts.token, name);
      break;
    } catch (error) {
      if (error instanceof SlackApiError && error.slackError === "name_taken") {
        name = slackChannelNameWithSuffix(base, `${Date.now().toString(36)}`);
        continue;
      }
      throw error;
    }
  }
  if (!created) throw new SlackApiError("name_taken");

  try {
    await db.insert(slackChannels).values({
      workspaceId: opts.workspaceId,
      issueId: opts.issueId,
      slackChannelId: created.id,
    });
    return created.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      await opts.client.archiveChannel(opts.token, created.id).catch(() => undefined);
      const winner = await db.query.slackChannels.findFirst({
        where: eq(slackChannels.issueId, opts.issueId),
      });
      if (winner) return winner.slackChannelId;
    }
    throw error;
  }
}

export async function syncSlackAfterWrite(
  opts: {
    workspaceId: string;
    issueId: string;
    actorId: string;
    text: string;
    mentionBefore: string;
    kind: SlackWriteKind;
    commentId?: string;
    source?: "app" | "slack";
  },
  client: SlackClient = liveSlackClient
): Promise<void> {
  if ((opts.source ?? "app") === "slack") return;
  if (!slackAppConfigured()) return;

  const installation = await db.query.slackInstallations.findFirst({
    where: eq(slackInstallations.workspaceId, opts.workspaceId),
  });
  if (!installation) return;

  const issue = await db.query.issues.findFirst({
    where: and(eq(issues.id, opts.issueId), eq(issues.workspaceId, opts.workspaceId)),
    with: { workspace: true },
  });
  if (!issue) return;

  const members = await workspaceMembers(opts.workspaceId);
  const newMentions = mentionsAdded(opts.mentionBefore, opts.text, members).filter(
    (member) => member.id !== opts.actorId
  );
  const author = members.find((member) => member.id === opts.actorId) ?? null;
  const channelRow = await db.query.slackChannels.findFirst({
    where: eq(slackChannels.issueId, opts.issueId),
  });
  if (channelRow?.archivedAt) return;
  if (opts.kind === "description" && newMentions.length === 0) return;
  if (!channelRow && newMentions.length === 0) return;

  const toResolve: Member[] = [];
  if (author) toResolve.push(author);
  toResolve.push(...newMentions);
  if (opts.kind === "comment" || channelRow) {
    toResolve.push(...resolveMentions(opts.text, members));
  }

  const token = decryptSecret(installation.botTokenEncrypted);
  const slackIds = await resolveSlackIds({
    workspaceId: opts.workspaceId,
    token,
    members: toResolve,
    client,
  });

  if (
    !shouldSyncSlackWrite({
      source: "app",
      kind: opts.kind,
      hasChannel: Boolean(channelRow),
      newMentionCount: newMentions.length,
      resolvedCount: slackIds.size,
    })
  ) {
    return;
  }

  const identifier = `${issue.workspace.prefix}-${issue.number}`;
  const channelId =
    channelRow?.slackChannelId ??
    (await ensureIssueChannel({
      workspaceId: opts.workspaceId,
      issueId: opts.issueId,
      identifier,
      title: issue.title,
      token,
      client,
    }));

  const inviteIds = [...slackIds.values()].filter(
    (id) => id !== installation.botUserId
  );
  await client.invite(token, channelId, inviteIds);

  const url = `${publicAppUrl()}${wsPath(issue.workspace.slug, `/issue/${identifier}`)}`;
  const mirroredBody = appMentionsToSlack(opts.text, members, slackIds).trim();
  const metadata = opts.commentId
    ? {
        event_type: "reline_comment" as const,
        event_payload: { comment_id: opts.commentId },
      }
    : undefined;

  if (opts.kind === "comment") {
    if (!channelRow) {
      await client.postMessage(
        token,
        channelId,
        formatSlackIssueMessage({
          identifier,
          title: issue.title,
          url,
          body: "",
        })
      );
    }
    if (!mirroredBody) return;

    const authorSlackId = author ? slackIds.get(author.id) : undefined;
    const authorLink = author
      ? await db.query.slackUserLinks.findFirst({
          where: and(
            eq(slackUserLinks.workspaceId, opts.workspaceId),
            eq(slackUserLinks.userId, author.id)
          ),
          columns: { userTokenEncrypted: true },
        })
      : null;
    const userToken = authorLink?.userTokenEncrypted
      ? decryptSecret(authorLink.userTokenEncrypted)
      : null;

    let posted: { ts: string } | null = null;
    if (userToken) {
      try {
        posted = await postWithUserToken({
          client,
          botToken: token,
          userToken,
          channelId,
          authorSlackId,
          text: mirroredBody,
          metadata,
        });
      } catch (error) {
        if (!(error instanceof SlackApiError)) throw error;
      }
    }
    if (!posted) {
      posted = await client.postMessage(
        token,
        channelId,
        formatSlackAttributedComment(author?.name ?? "Someone", mirroredBody),
        metadata ? { metadata } : undefined
      );
    }
    if (opts.commentId) {
      await db
        .update(comments)
        .set({ slackChannelId: channelId, slackTs: posted.ts })
        .where(eq(comments.id, opts.commentId));
    }
    return;
  }

  const message = formatSlackIssueMessage({
    identifier,
    title: issue.title,
    url,
    body: mirroredBody,
  });
  await client.postMessage(token, channelId, message);
}

async function postWithUserToken(opts: {
  client: SlackClient;
  botToken: string;
  userToken: string;
  channelId: string;
  authorSlackId: string | undefined;
  text: string;
  metadata?: { event_type: string; event_payload: Record<string, string> };
}): Promise<{ ts: string }> {
  const extra = opts.metadata ? { metadata: opts.metadata } : undefined;
  try {
    return await opts.client.postMessage(
      opts.userToken,
      opts.channelId,
      opts.text,
      extra
    );
  } catch (error) {
    if (
      !(error instanceof SlackApiError) ||
      error.slackError !== "not_in_channel" ||
      !opts.authorSlackId
    ) {
      throw error;
    }
    await opts.client.invite(opts.botToken, opts.channelId, [opts.authorSlackId]);
    return opts.client.postMessage(
      opts.userToken,
      opts.channelId,
      opts.text,
      extra
    );
  }
}

export async function setIssueSlackChannelArchived(
  opts: { workspaceId: string; issueId: string; archived: boolean },
  client: SlackClient = liveSlackClient
): Promise<void> {
  const channel = await db.query.slackChannels.findFirst({
    where: eq(slackChannels.issueId, opts.issueId),
  });
  if (!channel) return;
  if (opts.archived && channel.archivedAt) return;
  if (!opts.archived && !channel.archivedAt) return;

  const installation = await db.query.slackInstallations.findFirst({
    where: eq(slackInstallations.workspaceId, opts.workspaceId),
  });
  if (!installation) return;

  const token = decryptSecret(installation.botTokenEncrypted);
  if (opts.archived) {
    await client.archiveChannel(token, channel.slackChannelId);
    await db
      .update(slackChannels)
      .set({ archivedAt: new Date() })
      .where(eq(slackChannels.id, channel.id));
    return;
  }

  await client.unarchiveChannel(token, channel.slackChannelId);
  await db
    .update(slackChannels)
    .set({ archivedAt: null })
    .where(eq(slackChannels.id, channel.id));
}

export async function resolveRelineUserFromSlack(opts: {
  workspaceId: string;
  slackUserId: string;
  token: string;
  client?: SlackClient;
}): Promise<{ id: string; name: string; email: string; image: string | null } | null> {
  const client = opts.client ?? liveSlackClient;
  const existing = await db.query.slackUserLinks.findFirst({
    where: and(
      eq(slackUserLinks.workspaceId, opts.workspaceId),
      eq(slackUserLinks.slackUserId, opts.slackUserId)
    ),
    with: { user: true },
  });
  if (existing?.user) {
    return {
      id: existing.user.id,
      name: existing.user.name,
      email: existing.user.email,
      image: existing.user.image ?? null,
    };
  }

  const info = await client.userInfo(opts.token, opts.slackUserId);
  if (!info.email) return null;

  const member = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(memberships)
    .innerJoin(user, eq(memberships.userId, user.id))
    .where(
      and(
        eq(memberships.workspaceId, opts.workspaceId),
        eq(user.email, info.email)
      )
    )
    .limit(1);

  const found = member[0];
  if (!found) return null;
  try {
    await upsertUserLink(opts.workspaceId, found.id, opts.slackUserId);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return {
    id: found.id,
    name: found.name,
    email: found.email,
    image: found.image ?? null,
  };
}

export async function slackNamesByUserId(
  workspaceId: string
): Promise<Map<string, string>> {
  const rows = await db.query.slackUserLinks.findMany({
    where: eq(slackUserLinks.workspaceId, workspaceId),
    with: { user: true },
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.user) map.set(row.slackUserId, row.user.name);
  }
  return map;
}
