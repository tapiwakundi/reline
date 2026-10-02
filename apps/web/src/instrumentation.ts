export async function register() {
  // PostHog is created lazily on the first captured exception.
}

export async function onRequestError(
  error: unknown,
  request: Readonly<{
    path: string;
    method: string;
    headers: NodeJS.Dict<string | string[]>;
  }>,
  context: Readonly<{ routePath: string; routeType: string }>
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureServerException } = await import("./lib/posthog-server");
  await captureServerException(error, request, context);
}
