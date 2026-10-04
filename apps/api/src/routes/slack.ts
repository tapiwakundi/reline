import { Hono } from "hono";
import { HttpError } from "@/lib/context";
import { publicAppUrl } from "@/lib/slack/config";
import { requireWorkspace, type AuthEnv, type WorkspaceEnv } from "@/middleware/auth";
import {
  handleSlackEvent,
  parseSlackEvent,
  slackEventAuthorized,
} from "@/services/slack-events";
import {
  completeSlackInstall,
  completeSlackUserLink,
  disconnectSlack,
  loadSlackStatus,
  startSlackInstall,
  startSlackUserLink,
  workspaceSlugForState,
} from "@/services/slack";

export const slackRoutes = new Hono<WorkspaceEnv & AuthEnv>();

slackRoutes.get("/slack", requireWorkspace, async (c) => {
  return c.json(await loadSlackStatus(c.get("ctx")));
});

slackRoutes.get("/slack/oauth/start", requireWorkspace, async (c) => {
  return c.redirect(await startSlackInstall(c.get("ctx")));
});

slackRoutes.get("/slack/user/start", requireWorkspace, async (c) => {
  return c.redirect(await startSlackUserLink(c.get("ctx")));
});

slackRoutes.delete("/slack", requireWorkspace, async (c) => {
  await disconnectSlack(c.get("ctx"));
  return c.json({ ok: true });
});

slackRoutes.get("/slack/oauth/callback", async (c) => {
  return redirectSlackCallback(
    c.req.query("state"),
    () =>
      completeSlackInstall({
        code: c.req.query("code"),
        state: c.req.query("state"),
        error: c.req.query("error"),
      })
  );
});

slackRoutes.get("/slack/user/callback", async (c) => {
  return redirectSlackCallback(
    c.req.query("state"),
    () =>
      completeSlackUserLink({
        code: c.req.query("code"),
        state: c.req.query("state"),
        error: c.req.query("error"),
      })
  );
});

slackRoutes.post("/slack/events", async (c) => {
  const rawBody = await c.req.text();
  const timestamp = c.req.header("x-slack-request-timestamp") ?? "";
  const signature = c.req.header("x-slack-signature") ?? "";
  if (!slackEventAuthorized({ timestamp, rawBody, signature })) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const payload = parseSlackEvent(rawBody);
  if (!payload) return c.json({ error: "invalid payload" }, 400);
  if (payload.type === "url_verification") {
    return c.json({ challenge: payload.challenge ?? "" });
  }

  await handleSlackEvent(payload).catch((error) => {
    console.error("[slack] event", error);
  });
  return c.json({ ok: true });
});

async function redirectSlackCallback(
  state: string | undefined,
  complete: () => Promise<string>
) {
  try {
    return Response.redirect(await complete(), 302);
  } catch (error) {
    const slug = await workspaceSlugForState(state).catch(() => null);
    const fallback = slug
      ? `${publicAppUrl()}/${slug}/settings/slack?error=1`
      : publicAppUrl();
    if (error instanceof HttpError) {
      console.error("[slack] oauth", error.message);
    } else {
      console.error("[slack] oauth", error);
    }
    return Response.redirect(fallback, 302);
  }
}
