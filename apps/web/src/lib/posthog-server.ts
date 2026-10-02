import {
  pathWithoutSearch,
  resolvePostHogDistinctId,
} from "@reline/shared";
import { PostHog } from "posthog-node";
import { isNextControlFlowError, normalizePostHogHost } from "@/lib/posthog-config";

let client: PostHog | null | undefined;

export function getPostHogServer(): PostHog | null {
  if (client !== undefined) return client;
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) {
    client = null;
    return null;
  }
  client = new PostHog(token, {
    host: normalizePostHogHost(process.env.NEXT_PUBLIC_POSTHOG_HOST),
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

function headerValue(
  headers: NodeJS.Dict<string | string[]>,
  name: string
): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function captureServerException(
  error: unknown,
  request: Readonly<{
    path: string;
    method: string;
    headers: NodeJS.Dict<string | string[]>;
  }>,
  context: Readonly<{ routePath: string; routeType: string }>
): Promise<void> {
  if (isNextControlFlowError(error)) return;
  const posthog = getPostHogServer();
  if (!posthog) return;

  const cookie = headerValue(request.headers, "cookie");
  const distinctId = resolvePostHogDistinctId({
    header: headerValue(request.headers, "x-posthog-distinct-id"),
    cookie,
  });

  const send = posthog
    .captureExceptionImmediate(error, distinctId, {
      path: pathWithoutSearch(request.path),
      method: request.method,
      route: context.routePath,
      route_type: context.routeType,
      source: "web",
    })
    .catch((captureError: unknown) => {
      console.error(
        "PostHog server capture failed",
        captureError instanceof Error ? captureError.message : captureError
      );
    });
  // Don't hold the error page open if PostHog is slow or unreachable.
  await Promise.race([send, delay(1_000)]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}
