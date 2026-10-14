import { DEFAULT_STATUSES } from "./defaults";
import type { StatusType } from "./types";

export const STATUS_NAME_MAX = 40;

export const STATUS_TYPES: { value: StatusType; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "unstarted", label: "Unstarted" },
  { value: "started", label: "Started" },
  { value: "done", label: "Done" },
  { value: "canceled", label: "Canceled" },
];

const STATUS_TYPE_VALUES = new Set<string>(STATUS_TYPES.map((type) => type.value));

export function isStatusType(value: string): value is StatusType {
  return STATUS_TYPE_VALUES.has(value);
}

export function statusTypeLabel(type: StatusType): string {
  return STATUS_TYPES.find((option) => option.value === type)?.label ?? type;
}

export function isCompletedStatusType(type: string): boolean {
  return type === "done" || type === "canceled";
}

export function defaultStatusColor(type: StatusType): string {
  return DEFAULT_STATUSES.find((status) => status.type === type)?.color ?? "#5e6ad2";
}

/** Trim ends and collapse internal whitespace. */
export function normalizeStatusName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function isStatusColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

export type StatusNameResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

export function parseStatusName(
  name: string,
  existing: { id: string; name: string }[],
  ignoreId?: string
): StatusNameResult {
  const normalized = normalizeStatusName(name);
  if (!normalized) return { ok: false, error: "Column name is required" };
  if (normalized.length > STATUS_NAME_MAX) {
    return {
      ok: false,
      error: `Column name must be ${STATUS_NAME_MAX} characters or less`,
    };
  }
  const key = normalized.toLowerCase();
  const taken = existing.some(
    (status) => status.id !== ignoreId && normalizeStatusName(status.name).toLowerCase() === key
  );
  if (taken) return { ok: false, error: "A column with that name already exists" };
  return { ok: true, name: normalized };
}

/** Position for a column appended after the current board. */
export function nextStatusPosition(rows: { position: number }[]): number {
  let max = -1;
  for (const row of rows) {
    if (row.position > max) max = row.position;
  }
  return max + 1;
}

export type StatusOrderResult =
  | { ok: true; positions: { id: string; position: number }[] }
  | { ok: false; error: string };

/** Every current column, once, in the order the board should show. */
export function statusOrderUpdate(
  currentIds: string[],
  orderedIds: string[]
): StatusOrderResult {
  if (orderedIds.length !== currentIds.length) {
    return { ok: false, error: "Column order must include every column" };
  }
  const current = new Set(currentIds);
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (!current.has(id) || seen.has(id)) {
      return { ok: false, error: "Column order must include every column once" };
    }
    seen.add(id);
  }
  return {
    ok: true,
    positions: orderedIds.map((id, position) => ({ id, position })),
  };
}

export function normalizeStatusColor(color: string): string | null {
  const trimmed = color.trim();
  if (!isStatusColor(trimmed)) return null;
  return trimmed.toLowerCase();
}
