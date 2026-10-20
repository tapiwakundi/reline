import type { IssueUpdatePatch } from "@reline/shared";

type LabelIssue = {
  id: string;
  labelIds: string[];
};

/**
 * Turn one card's edit into the patch for another selected card.
 * Status, assignee, and the other single-value fields are copied.
 * Labels apply only the labels added or removed on the card that was edited,
 * so the other tickets keep the rest of their labels.
 * Returns null when this ticket should be left unchanged.
 */
export function patchForSelectedIssue(
  source: LabelIssue,
  target: LabelIssue,
  patch: IssueUpdatePatch
): IssueUpdatePatch | null {
  const next: IssueUpdatePatch = { ...patch };

  if (patch.labelIds !== undefined) {
    const after = new Set(patch.labelIds);
    const before = new Set(source.labelIds);
    const removed = source.labelIds.filter((id) => !after.has(id));
    const added = patch.labelIds.filter((id) => !before.has(id));
    if (removed.length === 0 && added.length === 0) {
      delete next.labelIds;
    } else {
      const drop = new Set(removed);
      const labels = target.labelIds.filter((id) => !drop.has(id));
      for (const id of added) {
        if (!labels.includes(id)) labels.push(id);
      }
      next.labelIds = labels;
    }
  }

  if (next.epicId != null && next.epicId === target.id) {
    delete next.epicId;
  }

  return Object.keys(next).length === 0 ? null : next;
}
