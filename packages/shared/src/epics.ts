import type { IssueType, StatusRow } from "./types";

/**
 * Epic id to persist. An epic never belongs to another epic, so its link is
 * cleared. `undefined` means the caller did not change the link.
 */
export function nextEpicId(input: {
  nextType: IssueType;
  requested: string | null | undefined;
}): string | null | undefined {
  if (input.nextType === "epic") return null;
  return input.requested;
}

export function epicProgress(
  children: { statusId: string }[],
  statuses: Pick<StatusRow, "id" | "type">[]
): { total: number; done: number } {
  const doneIds = new Set(
    statuses.filter((status) => status.type === "done").map((status) => status.id)
  );
  let done = 0;
  for (const child of children) {
    if (doneIds.has(child.statusId)) done++;
  }
  return { total: children.length, done };
}

export type EpicLinkRow = {
  id: string;
  type: IssueType;
  jiraKey?: string | null;
  parentKey?: string | null;
};

/** Pair imported issues with the epic that their Jira parent key points at. */
export function epicLinksToApply(rows: EpicLinkRow[]): { id: string; epicId: string }[] {
  const byKey = new Map<string, EpicLinkRow>();
  for (const row of rows) {
    const key = row.jiraKey?.trim().toLowerCase();
    if (key) byKey.set(key, row);
  }

  const links: { id: string; epicId: string }[] = [];
  for (const row of rows) {
    if (row.type === "epic") continue;
    const parentKey = row.parentKey?.trim().toLowerCase();
    if (!parentKey) continue;
    const parent = byKey.get(parentKey);
    if (!parent || parent.type !== "epic" || parent.id === row.id) continue;
    links.push({ id: row.id, epicId: parent.id });
  }
  return links;
}
