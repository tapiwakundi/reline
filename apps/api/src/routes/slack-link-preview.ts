import { Hono } from "hono";
import {
  internalPreviewAuthorized,
  SLACK_LINK_PREVIEW_HEADER,
} from "@/lib/slack/link-preview";
import { loadSlackLinkPreview } from "@/services/slack-link-preview";

export const slackLinkPreviewRoutes = new Hono();

slackLinkPreviewRoutes.get("/slack/link-preview/:slug/:key", async (c) => {
  if (
    !internalPreviewAuthorized(
      c.req.header(SLACK_LINK_PREVIEW_HEADER),
      process.env.RELINE_INTERNAL_KEY
    )
  ) {
    return c.json({ error: "Not found" }, 404);
  }

  const preview = await loadSlackLinkPreview(c.req.param("slug"), c.req.param("key"));
  if (!preview) return c.json({ error: "Not found" }, 404);
  return c.json(preview);
});
