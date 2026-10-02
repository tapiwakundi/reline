"use client";

import posthog from "posthog-js";

export function isPostHogEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN);
}

export function identifyUser(user: {
  id: string;
  email?: string | null;
  name?: string | null;
}): void {
  if (!isPostHogEnabled() || !user.id) return;
  posthog.identify(user.id, {
    email: user.email ?? undefined,
    name: user.name ?? undefined,
  });
}

export function groupWorkspace(workspace: {
  id: string;
  name: string;
  slug: string;
}): void {
  if (!isPostHogEnabled() || !workspace.id) return;
  posthog.group("workspace", workspace.id, {
    name: workspace.name,
    slug: workspace.slug,
  });
}

export function resetPostHog(): void {
  if (!isPostHogEnabled()) return;
  posthog.reset();
}

export function captureClientException(error: unknown): void {
  if (!isPostHogEnabled()) return;
  posthog.captureException(error);
}
