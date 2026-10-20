import { cache } from "react";
import { apiInternalUrl } from "@/lib/server-api";

export type SlackLinkPreview = {
  title: string;
  description: string;
};

export const loadSlackLinkPreview = cache(async function loadSlackLinkPreview(
  slug: string,
  key: string
): Promise<SlackLinkPreview | null> {
  const secret = process.env.RELINE_INTERNAL_KEY;
  if (!secret) return null;
  const url = `${apiInternalUrl()}/api/slack/link-preview/${encodeURIComponent(slug)}/${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, {
      headers: { "x-reline-internal-key": secret },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<SlackLinkPreview>;
    if (typeof body.title !== "string" || !body.title) return null;
    if (typeof body.description !== "string") return null;
    return { title: body.title, description: body.description };
  } catch {
    return null;
  }
});
