export {
  DEFAULT_POSTHOG_HOST,
  normalizePostHogHost,
  POSTHOG_PROXY_PATH,
  posthogUiHost,
} from "@reline/shared";

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
