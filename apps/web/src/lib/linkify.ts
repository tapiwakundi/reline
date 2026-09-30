/** Match http(s) URLs; trailing punctuation is trimmed from the href. */
const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

const TRAILING_PUNCT = /[.,;:!?)"'\]]+$/;

export type TextPart =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

/** Split plain text into text and link segments for rendering. */
export function splitLinks(text: string): TextPart[] {
  if (!text) return [];

  const parts: TextPart[] = [];
  let cursor = 0;
  const re = new RegExp(URL_RE.source, URL_RE.flags);

  for (const match of text.matchAll(re)) {
    const raw = match[0]!;
    const start = match.index ?? 0;
    if (start > cursor) {
      parts.push({ type: "text", value: text.slice(cursor, start) });
    }

    const punct = raw.match(TRAILING_PUNCT)?.[0] ?? "";
    const href = punct ? raw.slice(0, -punct.length) : raw;
    if (href) {
      parts.push({ type: "link", value: href, href });
    }
    if (punct) {
      parts.push({ type: "text", value: punct });
    }
    cursor = start + raw.length;
  }

  if (cursor < text.length) {
    parts.push({ type: "text", value: text.slice(cursor) });
  }

  return parts.length > 0 ? parts : [{ type: "text", value: text }];
}
