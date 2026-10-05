import { slackClientId, slackClientSecret } from "./config";

export class SlackApiError extends Error {
  constructor(public slackError: string) {
    super(`Slack API: ${slackError}`);
    this.name = "SlackApiError";
  }
}

export type SlackClient = {
  lookupByEmail(token: string, email: string): Promise<string | null>;
  userInfo(
    token: string,
    slackUserId: string
  ): Promise<{ email: string | null; name: string | null }>;
  createPrivateChannel(token: string, name: string): Promise<{ id: string }>;
  invite(token: string, channelId: string, userIds: string[]): Promise<void>;
  postMessage(
    token: string,
    channelId: string,
    text: string,
    opts?: {
      metadata?: {
        event_type: string;
        event_payload: Record<string, string>;
      };
    }
  ): Promise<{ ts: string }>;
  postEphemeral(
    token: string,
    channelId: string,
    userId: string,
    text: string
  ): Promise<void>;
  archiveChannel(token: string, channelId: string): Promise<void>;
  unarchiveChannel(token: string, channelId: string): Promise<void>;
  deleteMessage(token: string, channelId: string, ts: string): Promise<void>;
};

type SlackResponse = {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
};

async function slackMethod(
  token: string,
  method: string,
  body: Record<string, unknown>
): Promise<SlackResponse> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as SlackResponse;
  if (!data.ok) throw new SlackApiError(data.error ?? "unknown_error");
  return data;
}

const IGNORE_INVITE = new Set([
  "already_in_channel",
  "cant_invite",
  "cant_invite_self",
  "user_not_found",
  "not_in_channel",
]);

export const liveSlackClient: SlackClient = {
  async lookupByEmail(token, email) {
    try {
      const data = await slackMethod(token, "users.lookupByEmail", { email });
      const user = data.user as { id?: string } | undefined;
      return user?.id ?? null;
    } catch (error) {
      if (error instanceof SlackApiError && error.slackError === "users_not_found") {
        return null;
      }
      throw error;
    }
  },

  async userInfo(token, slackUserId) {
    const data = await slackMethod(token, "users.info", { user: slackUserId });
    const user = data.user as {
      real_name?: string;
      name?: string;
      profile?: { email?: string };
    } | undefined;
    return {
      email: user?.profile?.email ?? null,
      name: user?.real_name || user?.name || null,
    };
  },

  async createPrivateChannel(token, name) {
    const data = await slackMethod(token, "conversations.create", {
      name,
      is_private: true,
    });
    const channel = data.channel as { id?: string } | undefined;
    if (!channel?.id) throw new SlackApiError("no_channel");
    return { id: channel.id };
  },

  async invite(token, channelId, userIds) {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) return;
    try {
      await slackMethod(token, "conversations.invite", {
        channel: channelId,
        users: unique.join(","),
      });
    } catch (error) {
      if (!(error instanceof SlackApiError)) throw error;
      if (unique.length > 1) {
        for (const id of unique) {
          await liveSlackClient.invite(token, channelId, [id]);
        }
        return;
      }
      if (IGNORE_INVITE.has(error.slackError)) return;
      throw error;
    }
  },

  async postMessage(token, channelId, text, opts) {
    const data = await slackMethod(token, "chat.postMessage", {
      channel: channelId,
      text,
      unfurl_links: false,
      unfurl_media: false,
      ...(opts?.metadata ? { metadata: opts.metadata } : {}),
    });
    const ts = typeof data.ts === "string" ? data.ts : null;
    if (!ts) throw new SlackApiError("no_ts");
    return { ts };
  },

  async postEphemeral(token, channelId, userId, text) {
    await slackMethod(token, "chat.postEphemeral", {
      channel: channelId,
      user: userId,
      text,
    });
  },

  async archiveChannel(token, channelId) {
    try {
      await slackMethod(token, "conversations.archive", { channel: channelId });
    } catch (error) {
      if (
        error instanceof SlackApiError &&
        (error.slackError === "already_archived" ||
          error.slackError === "channel_not_found")
      ) {
        return;
      }
      throw error;
    }
  },

  async unarchiveChannel(token, channelId) {
    try {
      await slackMethod(token, "conversations.unarchive", { channel: channelId });
    } catch (error) {
      if (
        error instanceof SlackApiError &&
        (error.slackError === "not_archived" ||
          error.slackError === "channel_not_found")
      ) {
        return;
      }
      throw error;
    }
  },

  async deleteMessage(token, channelId, ts) {
    await slackMethod(token, "chat.delete", { channel: channelId, ts });
  },
};

export type SlackOAuthInstall = {
  accessToken: string;
  botUserId: string;
  teamId: string;
  teamName: string;
  authedUserId: string | null;
};

export async function exchangeSlackInstallCode(opts: {
  code: string;
  redirectUri: string;
}): Promise<SlackOAuthInstall> {
  const data = await slackForm("https://slack.com/api/oauth.v2.access", {
    client_id: slackClientId(),
    client_secret: slackClientSecret(),
    code: opts.code,
    redirect_uri: opts.redirectUri,
  });
  if (!data.ok) throw new SlackApiError(String(data.error ?? "oauth_failed"));
  const team = data.team as { id?: string; name?: string } | undefined;
  const authed = data.authed_user as { id?: string } | undefined;
  if (!data.access_token || !data.bot_user_id || !team?.id) {
    throw new SlackApiError("oauth_incomplete");
  }
  return {
    accessToken: String(data.access_token),
    botUserId: String(data.bot_user_id),
    teamId: team.id,
    teamName: team.name ?? team.id,
    authedUserId: authed?.id ?? null,
  };
}

export type SlackUserGrant = {
  slackUserId: string;
  teamId: string;
  accessToken: string;
};

export async function exchangeSlackUserCode(opts: {
  code: string;
  redirectUri: string;
}): Promise<SlackUserGrant> {
  const data = await slackForm("https://slack.com/api/oauth.v2.access", {
    client_id: slackClientId(),
    client_secret: slackClientSecret(),
    code: opts.code,
    redirect_uri: opts.redirectUri,
  });
  if (!data.ok) throw new SlackApiError(String(data.error ?? "oauth_failed"));
  const team = data.team as { id?: string } | undefined;
  const authed = data.authed_user as
    | { id?: string; access_token?: string }
    | undefined;
  if (!authed?.id || !authed.access_token || !team?.id) {
    throw new SlackApiError("oauth_incomplete");
  }
  return {
    slackUserId: authed.id,
    teamId: team.id,
    accessToken: authed.access_token,
  };
}

async function slackForm(
  url: string,
  params: Record<string, string>
): Promise<SlackResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return (await res.json()) as SlackResponse;
}
