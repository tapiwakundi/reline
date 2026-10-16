import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SlackApiError, type SlackClient } from "./client";
import { installationCanUnfurl, SLACK_BOT_SCOPES } from "./scopes";
import {
  descriptionExcerpt,
  issueLinksOnOrigin,
  ticketUnfurlContent,
  unfurlSharedIssueLinks,
  type LinkSharedEvent,
  type UnfurlInstallation,
  type UnfurlIssue,
} from "./unfurl";
import type { WorkspaceContext } from "@/lib/context";
import { getSlackSettingsStatus, slackAuthorizeUrl } from "@/services/slack";

const ORIGIN = "https://reline-web.onrender.com";
const SCOPES = SLACK_BOT_SCOPES.join(",");

function install(overrides: Partial<UnfurlInstallation> = {}): UnfurlInstallation {
  return {
    workspaceId: "ws_1",
    workspaceSlug: "siimplytrade",
    prefix: "SMPL",
    botScopes: SCOPES,
    token: "xoxb-test",
    ...overrides,
  };
}

function issue(overrides: Partial<UnfurlIssue> = {}): UnfurlIssue {
  return {
    number: 29,
    title: "Fix login redirect",
    description: "The preview says **login**. See [docs](https://example.com/x).",
    priority: 2,
    type: "bug",
    statusName: "In Progress",
    statusColor: "#f2c94c",
    assigneeName: "Ada Lovelace",
    ...overrides,
  };
}

function posted(links: { url?: string }[]): LinkSharedEvent {
  return {
    type: "link_shared",
    channel: "C123",
    message_ts: "111.222",
    unfurl_id: "Uf1",
    source: "conversations_history",
    links,
  };
}

test("issue links on the app host are kept and other urls are ignored", () => {
  const links = issueLinksOnOrigin(
    [
      { url: `${ORIGIN}/siimplytrade/issue/SMPL-29` },
      { url: `${ORIGIN}/siimplytrade/issue/SMPL-29` },
      { url: `${ORIGIN}/siimplytrade/issue/SMPL-30?ref=slack` },
      { url: `${ORIGIN}/login` },
      { url: `${ORIGIN}/siimplytrade/board` },
      { url: "https://example.com/siimplytrade/issue/SMPL-29" },
      { url: "not a url" },
    ],
    ORIGIN
  );
  assert.deepEqual(
    links.map((link) => link.url),
    [
      `${ORIGIN}/siimplytrade/issue/SMPL-29`,
      `${ORIGIN}/siimplytrade/issue/SMPL-30?ref=slack`,
    ]
  );
  assert.equal(links[1]?.slug, "siimplytrade");
  assert.equal(links[1]?.identifier, "SMPL-30");
});

test("ticket preview names the issue instead of the login page", () => {
  const content = ticketUnfurlContent({
    identifier: "SMPL-29",
    title: "a < b & c",
    url: `${ORIGIN}/siimplytrade/issue/SMPL-29`,
    statusName: "In Progress",
    statusColor: "red",
    priorityLabel: "High",
    typeLabel: "Bug",
    assigneeName: null,
    description: "The preview says **login**. See [docs](https://example.com/x).",
  });
  assert.equal(content.color, "#5e6ad2");
  assert.equal(content.fallback, "SMPL-29 a < b & c");
  const text = content.blocks[0].text.text;
  assert.match(text, /SMPL-29 a &lt; b &amp; c/);
  assert.match(text, /Bug · In Progress · High · Unassigned/);
  assert.match(text, /The preview says login\. See docs\./);
  assert.doesNotMatch(text, /Log in/);
  assert.equal(content.preview.title.text, "SMPL-29 a < b & c");
});

test("description excerpts collapse markdown and stay short", () => {
  const excerpt = descriptionExcerpt(`${"word ".repeat(80)}tail`);
  assert.ok(excerpt.length <= 240);
  assert.ok(excerpt.endsWith("…"));
  assert.equal(descriptionExcerpt("   "), "");
});

test("connected slack workspace unfurls ticket details for its own issues", async () => {
  const calls: { token: string; unfurls: Record<string, { blocks: { text: { text: string } }[] }> }[] = [];
  const loaded: { workspaceId: string; numbers: number[] }[] = [];
  const url = `${ORIGIN}/SiimplyTrade/issue/smpl-29`;
  await unfurlSharedIssueLinks({
    appOrigin: ORIGIN,
    installations: [install()],
    event: posted([{ url }]),
    loadIssues: async (workspaceId, numbers) => {
      loaded.push({ workspaceId, numbers });
      return [issue()];
    },
    client: {
      unfurl: async (token, opts) => {
        calls.push({
          token,
          unfurls: opts.unfurls as (typeof calls)[number]["unfurls"],
        });
        assert.equal(opts.channel, "C123");
        assert.equal(opts.ts, "111.222");
        assert.equal(opts.unfurlId, "Uf1");
        assert.equal(opts.source, "conversations_history");
      },
    },
  });
  assert.deepEqual(loaded, [{ workspaceId: "ws_1", numbers: [29] }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.token, "xoxb-test");
  const text = calls[0]?.unfurls[url]?.blocks[0]?.text.text ?? "";
  assert.match(text, /SMPL-29/);
  assert.match(text, /Fix login redirect/);
  assert.match(text, /In Progress/);
  assert.match(text, /Ada Lovelace/);
  assert.match(text, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("a link to another reline workspace is not unfurled", async () => {
  let called = false;
  await unfurlSharedIssueLinks({
    appOrigin: ORIGIN,
    installations: [install()],
    event: posted([{ url: `${ORIGIN}/other/issue/SMPL-29` }]),
    loadIssues: async () => {
      throw new Error("should not load issues for an unconnected workspace");
    },
    client: {
      unfurl: async () => {
        called = true;
      },
    },
  });
  assert.equal(called, false);
});

test("an install without preview scopes does not unfurl", async () => {
  let called = false;
  await unfurlSharedIssueLinks({
    appOrigin: ORIGIN,
    installations: [install({ botScopes: "chat:write,groups:history" })],
    event: posted([{ url: `${ORIGIN}/siimplytrade/issue/SMPL-29` }]),
    loadIssues: async () => [issue()],
    client: {
      unfurl: async () => {
        called = true;
      },
    },
  });
  assert.equal(called, false);
});

test("missing issues and a prefix mismatch produce no preview", async () => {
  let calls = 0;
  const client = {
    unfurl: async () => {
      calls += 1;
    },
  };
  await unfurlSharedIssueLinks({
    appOrigin: ORIGIN,
    installations: [install()],
    event: posted([{ url: `${ORIGIN}/siimplytrade/issue/SMPL-29` }]),
    loadIssues: async () => [],
    client,
  });
  await unfurlSharedIssueLinks({
    appOrigin: ORIGIN,
    installations: [install({ prefix: "REL" })],
    event: posted([{ url: `${ORIGIN}/siimplytrade/issue/SMPL-29` }]),
    loadIssues: async () => [issue()],
    client,
  });
  assert.equal(calls, 0);
});

test("one message unfurls each connected workspace with its own token", async () => {
  const calls: { token: string; urls: string[] }[] = [];
  await unfurlSharedIssueLinks({
    appOrigin: ORIGIN,
    installations: [
      install(),
      install({
        workspaceId: "ws_2",
        workspaceSlug: "other",
        prefix: "OTH",
        token: "xoxb-other",
      }),
    ],
    event: posted([
      { url: `${ORIGIN}/siimplytrade/issue/SMPL-29` },
      { url: `${ORIGIN}/other/issue/OTH-3` },
    ]),
    loadIssues: async (workspaceId) => {
      if (workspaceId === "ws_2") {
        return [issue({ number: 3, title: "Other ticket" })];
      }
      return [issue()];
    },
    client: {
      unfurl: async (token, opts) => {
        calls.push({ token, urls: Object.keys(opts.unfurls) });
      },
    },
  });
  assert.deepEqual(calls, [
    { token: "xoxb-test", urls: [`${ORIGIN}/siimplytrade/issue/SMPL-29`] },
    { token: "xoxb-other", urls: [`${ORIGIN}/other/issue/OTH-3`] },
  ]);
});

test("composer previews use the unfurl id and skip channel", async () => {
  const seen: { opts: Parameters<SlackClient["unfurl"]>[1] | null } = { opts: null };
  await unfurlSharedIssueLinks({
    appOrigin: ORIGIN,
    installations: [install()],
    event: {
      type: "link_shared",
      source: "composer",
      channel_id: "COMPOSER",
      message_ts: "composer-id",
      unfurl_id: "composer-id",
      links: [{ url: `${ORIGIN}/siimplytrade/issue/SMPL-29` }],
    },
    loadIssues: async () => [issue()],
    client: {
      unfurl: async (_token, opts) => {
        seen.opts = opts;
      },
    },
  });
  assert.equal(seen.opts?.channel, undefined);
  assert.equal(seen.opts?.ts, undefined);
  assert.equal(seen.opts?.unfurlId, "composer-id");
  assert.equal(seen.opts?.source, "composer");
});

test("missing_scope is ignored and other slack errors surface", async () => {
  await unfurlSharedIssueLinks({
    appOrigin: ORIGIN,
    installations: [install()],
    event: posted([{ url: `${ORIGIN}/siimplytrade/issue/SMPL-29` }]),
    loadIssues: async () => [issue()],
    client: {
      unfurl: async () => {
        throw new SlackApiError("missing_scope");
      },
    },
  });
  await assert.rejects(
    unfurlSharedIssueLinks({
      appOrigin: ORIGIN,
      installations: [install()],
      event: posted([{ url: `${ORIGIN}/siimplytrade/issue/SMPL-29` }]),
      loadIssues: async () => [issue()],
      client: {
        unfurl: async () => {
          throw new SlackApiError("invalid_auth");
        },
      },
    }),
    (error: unknown) => error instanceof SlackApiError && error.slackError === "invalid_auth"
  );
});

test("preview scopes are recognized only when both link scopes are present", () => {
  assert.equal(installationCanUnfurl(null), false);
  assert.equal(installationCanUnfurl("links:read"), false);
  assert.equal(installationCanUnfurl("links:read,links:write"), true);
  assert.equal(installationCanUnfurl("links:read links:write"), true);
});

test("settings report link previews only after the new scopes are granted", () => {
  const ctx = { membership: { role: "owner" } } as WorkspaceContext;
  assert.equal(
    getSlackSettingsStatus(ctx, { teamName: "Acme", botScopes: null }, true, false).linkPreviews,
    false
  );
  assert.equal(
    getSlackSettingsStatus(ctx, { teamName: "Acme", botScopes: SCOPES }, true, false).linkPreviews,
    true
  );
});

test("install url and the slack manifest both request link unfurling", () => {
  const manifest = JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../slack-app-manifest.json"),
      "utf8"
    )
  ) as {
    features: { unfurl_domains: string[] };
    oauth_config: { scopes: { bot: string[] } };
    settings: { event_subscriptions: { bot_events: string[] } };
  };
  const previous = process.env.SLACK_CLIENT_ID;
  process.env.SLACK_CLIENT_ID = "111.222";
  try {
    const url = new URL(slackAuthorizeUrl("install", "state"));
    const requested = url.searchParams.get("scope")?.split(",") ?? [];
    assert.deepEqual([...requested].sort(), [...SLACK_BOT_SCOPES].sort());
    assert.deepEqual(new Set(manifest.oauth_config.scopes.bot), new Set(SLACK_BOT_SCOPES));
    assert.ok(manifest.settings.event_subscriptions.bot_events.includes("link_shared"));
    assert.ok(manifest.features.unfurl_domains.includes("reline-web.onrender.com"));
  } finally {
    if (previous === undefined) delete process.env.SLACK_CLIENT_ID;
    else process.env.SLACK_CLIENT_ID = previous;
  }
});
