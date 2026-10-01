import type { Member } from "./types";

type Hit = { start: number; end: number; member: Member; label: string };

/**
 * Find all @mentions in body, preferring longer matches and ignoring overlaps.
 * Supports `@Full Name` and `@email`.
 */
function findMentionHits(body: string, members: Member[]): Hit[] {
  if (!body.includes("@") || members.length === 0) return [];

  const candidates: Hit[] = [];

  for (const member of members) {
    for (const needle of [member.name, member.email].filter(Boolean)) {
      const token = `@${needle}`;
      let from = 0;
      while (from < body.length) {
        const idx = body.toLowerCase().indexOf(token.toLowerCase(), from);
        if (idx === -1) break;
        const end = idx + token.length;
        const badBoundary = idx > 0 && /[\w.]/.test(body[idx - 1]!);
        const badEnd = !!body[end] && /[\w]/.test(body[end]!);
        if (!badBoundary && !badEnd) {
          candidates.push({
            start: idx,
            end,
            member,
            label: `@${member.name}`,
          });
        }
        from = idx + 1;
      }
    }
  }

  // Longest match first, then earlier position — greedily keep non-overlapping
  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);

  const hits: Hit[] = [];
  for (const c of candidates) {
    if (hits.some((h) => c.start < h.end && c.end > h.start)) continue;
    hits.push(c);
  }

  return hits.sort((a, b) => a.start - b.start);
}

/** Workspace members referenced via @Name / @email in text. */
export function resolveMentions(body: string, members: Member[]): Member[] {
  const seen = new Map<string, Member>();
  for (const hit of findMentionHits(body, members)) {
    seen.set(hit.member.id, hit.member);
  }
  return [...seen.values()];
}

/** Members mentioned in `after` who were not already mentioned in `before`. */
export function mentionsAdded(
  before: string,
  after: string,
  members: Member[]
): Member[] {
  const previous = new Set(resolveMentions(before, members).map((member) => member.id));
  return resolveMentions(after, members).filter((member) => !previous.has(member.id));
}

/** Character ranges of @mentions, using the text as it appears in the source. */
export function mentionSpans(
  body: string,
  members: Member[]
): Array<{ start: number; end: number; member: Member }> {
  return findMentionHits(body, members).map((hit) => ({
    start: hit.start,
    end: hit.end,
    member: hit.member,
  }));
}

/** Split comment body into plain text and @mention segments for rendering. */
export function splitMentions(
  body: string,
  members: Member[]
): Array<{ type: "text" | "mention"; value: string; member?: Member }> {
  const hits = findMentionHits(body, members);
  if (hits.length === 0) return [{ type: "text", value: body }];

  const parts: Array<{ type: "text" | "mention"; value: string; member?: Member }> =
    [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start > cursor) {
      parts.push({ type: "text", value: body.slice(cursor, hit.start) });
    }
    parts.push({ type: "mention", value: hit.label, member: hit.member });
    cursor = hit.end;
  }
  if (cursor < body.length) {
    parts.push({ type: "text", value: body.slice(cursor) });
  }
  return parts;
}
