const GOOGLE_LINK_ERRORS = new Set([
  "account_not_linked",
  "unable_to_link_account",
  "email_doesn't_match",
  "account_already_linked_to_different_user",
]);

export type GoogleLinkStep = "link" | "confirm" | "conflict";

/** Same-origin path for post-login redirects. */
export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/"
): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\")
  ) {
    return fallback;
  }
  if (trimmed.includes("\\") || /[\u0000-\u001F\u007F]/.test(trimmed)) {
    return fallback;
  }
  // A second decode of encoded slashes can hide a protocol-relative path.
  if (/%2f|%5c/i.test(trimmed)) return fallback;

  let url: URL;
  try {
    url = new URL(trimmed, "http://internal.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://internal.invalid") return fallback;
  return `${url.pathname}${url.search}`;
}

export function googleErrorCallbackURL(callbackURL: string): string {
  const next = safeInternalPath(callbackURL);
  return `/login?next=${encodeURIComponent(next)}`;
}

export function isGoogleLinkError(code: string | null): boolean {
  return code != null && GOOGLE_LINK_ERRORS.has(code);
}

/**
 * How to continue when Google sign-in finds an existing password account.
 * Logged-out users confirm the link. Signed-in users finish with linkSocial.
 */
export function googleLinkStep(
  error: string | null,
  hasSession: boolean
): GoogleLinkStep | null {
  if (error === "account_already_linked_to_different_user") {
    return hasSession ? "conflict" : null;
  }
  if (error === "email_doesn't_match") {
    return hasSession ? "confirm" : null;
  }
  if (error === "account_not_linked" || error === "unable_to_link_account") {
    return hasSession ? "confirm" : "link";
  }
  return null;
}

export function oauthErrorMessage(code: string): string {
  switch (code) {
    case "account_not_linked":
      return "This email already has a password account. Link Google to continue.";
    case "unable_to_link_account":
      return "Could not connect Google. Try again.";
    case "email_doesn't_match":
      return "That Google account uses a different email. Choose the Google account for the email you signed in with.";
    case "account_already_linked_to_different_user":
      return "That Google account is already connected to a different user.";
    case "access_denied":
      return "Google sign-in was cancelled.";
    case "email_not_found":
      return "Google did not share an email address.";
    case "state_mismatch":
    case "please_restart_the_process":
      return "Google sign-in expired. Try again.";
    default:
      return "Google sign-in failed. Try again.";
  }
}
