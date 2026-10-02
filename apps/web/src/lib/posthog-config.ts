export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * First-party path the browser uses instead of posthog.com.
 * `/ingest` is on ad-block lists, so this name stays specific to Reline.
 */
export const POSTHOG_PROXY_PATH = "/rline";

export function normalizePostHogHost(raw: string | undefined): string {
  const value = (raw || DEFAULT_POSTHOG_HOST).trim().replace(/\/$/, "");
  return value || DEFAULT_POSTHOG_HOST;
}

/** Toolbar and "view in PostHog" links use the app host, not the ingest host. */
export function posthogUiHost(ingestHost: string): string {
  if (
    ingestHost.includes("eu.i.posthog.com") ||
    ingestHost.includes("eu.posthog.com")
  ) {
    return "https://eu.posthog.com";
  }
  if (
    ingestHost.includes("us.i.posthog.com") ||
    ingestHost.includes("us.posthog.com")
  ) {
    return "https://us.posthog.com";
  }
  return ingestHost;
}

/** Session replay and array assets are served from a separate Cloud host. */
export function posthogAssetsHost(ingestHost: string): string {
  if (ingestHost.includes("eu.i.posthog.com")) {
    return "https://eu-assets.i.posthog.com";
  }
  if (ingestHost.includes("us.i.posthog.com")) {
    return "https://us-assets.i.posthog.com";
  }
  return ingestHost;
}

/** Same-origin rewrites. Static bundles come from the asset host. */
export function posthogRewrites(ingestHost: string): {
  source: string;
  destination: string;
}[] {
  const assets = posthogAssetsHost(ingestHost);
  return [
    {
      source: `${POSTHOG_PROXY_PATH}/static/:path*`,
      destination: `${assets}/static/:path*`,
    },
    {
      source: `${POSTHOG_PROXY_PATH}/array/:path*`,
      destination: `${assets}/array/:path*`,
    },
    {
      source: `${POSTHOG_PROXY_PATH}/:path*`,
      destination: `${ingestHost}/:path*`,
    },
  ];
}

/** Server component failures already carry a digest and are reported on the server. */
export function shouldCaptureClientException(error: { digest?: string }): boolean {
  return !error.digest;
}

/** `redirect()` and `notFound()` are control flow, not product errors. */
export function isNextControlFlowError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return (
    digest.startsWith("NEXT_REDIRECT") ||
    digest.startsWith("NEXT_NOT_FOUND") ||
    digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
  );
}
