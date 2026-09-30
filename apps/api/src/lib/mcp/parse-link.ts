export type IssueRef = {
  /** Workspace slug parsed from an issue URL. */
  slug?: string;
  /** Issue key as given, for example REL-42. Prefix casing is preserved. */
  identifier: string;
};

const KEY = /^(.+)-(\d+)$/;

export function splitIssueKey(
  identifier: string
): { prefix: string; number: number } | null {
  const match = identifier.trim().match(KEY);
  if (!match) return null;
  const prefix = match[1].trim();
  const number = Number(match[2]);
  if (
    !prefix ||
    prefix.includes("/") ||
    prefix.includes("\\") ||
    !Number.isInteger(number) ||
    number < 1
  ) {
    return null;
  }
  return { prefix, number };
}

/**
 * Accept a full issue URL (`/{workspace}/issue/{KEY}`) or a bare key (`REL-42`).
 */
export function parseIssueRef(input: string): IssueRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    if (!splitIssueKey(trimmed)) return null;
    return { identifier: trimmed };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[1]?.toLowerCase() !== "issue") return null;

  let slug: string;
  let identifier: string;
  try {
    slug = decodeURIComponent(parts[0] ?? "");
    identifier = decodeURIComponent(parts[2] ?? "");
  } catch {
    return null;
  }
  if (!slug || /[\\/]/.test(slug) || !splitIssueKey(identifier)) return null;
  return { slug, identifier };
}
