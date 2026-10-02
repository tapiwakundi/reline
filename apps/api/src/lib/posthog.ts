import {
  pathWithoutSearch,
  resolvePostHogDistinctId,
} from "@reline/shared";
import { PostHog } from "posthog-node";

const DEFAULT_HOST = "https://us.i.posthog.com";

let client: PostHog | null | undefined;

export function getPostHog(): PostHog | null {
  if (client !== undefined) return client;
  const token = process.env.POSTHOG_PROJECT_TOKEN;
  if (!token) {
    client = null;
    return null;
  }
  const host = (process.env.POSTHOG_HOST || DEFAULT_HOST).trim().replace(/\/$/, "");
  client = new PostHog(token, {
    host: host || DEFAULT_HOST,
    enableExceptionAutocapture: true,
  });
  return client;
}

export async function shutdownPostHog(): Promise<void> {
  if (!client) return;
  const current = client;
  client = undefined;
  await current.shutdown();
}

export async function captureApiException(
  err: unknown,
  input: {
    userId?: string | null;
    header?: string | null;
    cookie?: string | null;
    path: string;
    method: string;
    workspaceSlug?: string | null;
  }
): Promise<void> {
  const posthog = getPostHog();
  if (!posthog) return;
  const distinctId = resolvePostHogDistinctId(input);
  const properties: Record<string, string> = {
    path: pathWithoutSearch(input.path),
    method: input.method,
    source: "api",
  };
  if (input.workspaceSlug) properties.workspace_slug = input.workspaceSlug;

  const send = posthog.captureExceptionImmediate(err, distinctId, properties).catch(
    (captureError: unknown) => {
      console.error(
        "PostHog capture failed",
        captureError instanceof Error ? captureError.message : captureError
      );
    }
  );
  // Don't hold the HTTP response open if PostHog is slow or unreachable.
  await Promise.race([send, delay(1_000)]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}
