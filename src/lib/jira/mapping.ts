import type { StatusRow, Member } from "@/lib/types";

/** Map a Jira status name to one of the workspace's statuses. */
export function mapJiraStatus(
  jiraStatus: string,
  statuses: StatusRow[]
): StatusRow {
  const name = jiraStatus.trim().toLowerCase();

  const exact = statuses.find((s) => s.name.toLowerCase() === name);
  if (exact) return exact;

  const byType = (type: StatusRow["type"]) =>
    statuses.find((s) => s.type === type);

  if (["backlog"].includes(name)) return byType("backlog") ?? statuses[0];
  if (
    ["to do", "todo", "open", "selected for development", "ready"].includes(name)
  )
    return byType("unstarted") ?? statuses[0];
  if (
    ["in progress", "in review", "in development", "review", "testing"].includes(
      name
    )
  )
    return byType("started") ?? statuses[0];
  if (["done", "closed", "resolved", "complete", "completed"].includes(name))
    return byType("done") ?? statuses[0];
  if (["canceled", "cancelled", "won't do", "wont do", "rejected"].includes(name))
    return byType("canceled") ?? statuses[0];

  return byType("backlog") ?? statuses[0];
}

/** Map a Jira priority name to Reline's 0-4 scale. */
export function mapJiraPriority(jiraPriority: string): number {
  switch (jiraPriority.trim().toLowerCase()) {
    case "highest":
    case "blocker":
    case "urgent":
      return 1;
    case "high":
    case "critical":
    case "major":
      return 2;
    case "medium":
      return 3;
    case "low":
    case "lowest":
    case "minor":
    case "trivial":
      return 4;
    default:
      return 0;
  }
}

/** Map a Jira issue type name to Reline's story | task | bug. */
export function mapJiraIssueType(
  jiraType: string
): "story" | "task" | "bug" {
  switch (jiraType.trim().toLowerCase()) {
    case "story":
    case "user story":
    case "epic":
      return "story";
    case "bug":
    case "defect":
    case "error":
      return "bug";
    case "task":
    case "sub-task":
    case "subtask":
    default:
      return "task";
  }
}

/** Match a Jira assignee (email or display name) to a workspace member. */
export function mapJiraAssignee(
  value: string,
  members: Member[]
): Member | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  return (
    members.find((m) => m.email.toLowerCase() === v) ??
    members.find((m) => m.name.toLowerCase() === v) ??
    null
  );
}

/**
 * Minimal CSV parser handling quoted fields, escaped quotes, and newlines
 * inside quotes. Returns array of rows (arrays of strings).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

const JIRA_MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Parse Jira CSV dates (`30/Jul/26 10:03 PM`) and API ISO timestamps.
 * Returns undefined when the value is empty or unparseable.
 */
export function parseJiraDate(value: string | undefined | null): Date | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;

  // CSV export: 30/Jul/26 10:03 PM  or  30/Jul/2026 10:03 AM
  const csv = raw.match(
    /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i
  );
  if (csv) {
    const day = Number(csv[1]);
    const month = JIRA_MONTHS[csv[2].toLowerCase()];
    let year = Number(csv[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    let hour = csv[4] ? Number(csv[4]) : 0;
    const minute = csv[5] ? Number(csv[5]) : 0;
    const ampm = csv[6]?.toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    if (month == null || day < 1 || day > 31) return undefined;
    const d = new Date(year, month, day, hour, minute);
    return isNaN(d.getTime()) ? undefined : d;
  }

  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d;
}

/** Extract plain text from Jira's ADF (Atlassian Document Format) tree. */
export function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === "text") return n.text ?? "";
  const children = (n.content ?? []).map(adfToText).join("");
  if (n.type === "paragraph" || n.type === "heading") return children + "\n";
  if (n.type === "listItem") return "- " + children;
  return children;
}

export type JiraSprint = {
  /** Stable dedupe key: jira id when known, otherwise lowercased name. */
  key: string;
  jiraId?: number;
  name: string;
  state?: "future" | "active" | "closed";
  startDate?: Date;
  endDate?: Date;
};

function normalizeSprintState(
  raw: string | undefined | null
): JiraSprint["state"] | undefined {
  const s = raw?.trim().toLowerCase();
  if (!s) return undefined;
  if (s === "active" || s === "future") return s;
  if (s === "closed" || s === "complete" || s === "completed") return "closed";
  return undefined;
}

function sprintFromParts(parts: {
  id?: number;
  name?: string;
  state?: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}): JiraSprint | null {
  const name = parts.name?.trim();
  if (!name) return null;
  const jiraId =
    typeof parts.id === "number" && Number.isFinite(parts.id)
      ? parts.id
      : undefined;
  const startDate =
    parts.startDate instanceof Date
      ? parts.startDate
      : parseJiraDate(
          typeof parts.startDate === "string" ? parts.startDate : undefined
        );
  const endDate =
    parts.endDate instanceof Date
      ? parts.endDate
      : parseJiraDate(
          typeof parts.endDate === "string" ? parts.endDate : undefined
        );
  return {
    key: jiraId != null ? `id:${jiraId}` : `name:${name.toLowerCase()}`,
    jiraId,
    name,
    state: normalizeSprintState(parts.state),
    startDate,
    endDate,
  };
}

/** Parse Greenhopper's legacy `Sprint@hash[id=…,name=…]` string. */
function parseGreenhopperSprint(raw: string): JiraSprint | null {
  const name = raw.match(/name=([^,\]]*)/)?.[1]?.trim();
  if (!name) return null;
  const idRaw = raw.match(/id=(\d+)/)?.[1];
  const state = raw.match(/state=([^,\]]*)/)?.[1];
  const startDate = raw.match(/startDate=([^,\]]*)/)?.[1];
  const endDate = raw.match(/endDate=([^,\]]*)/)?.[1];
  return sprintFromParts({
    id: idRaw ? Number(idRaw) : undefined,
    name,
    state,
    startDate:
      startDate && startDate !== "<null>" && startDate !== "null"
        ? startDate
        : undefined,
    endDate:
      endDate && endDate !== "<null>" && endDate !== "null" ? endDate : undefined,
  });
}

/**
 * Parse a Jira API sprint custom-field value (object, array, or Greenhopper
 * string). Returns every sprint referenced on the issue.
 */
export function parseJiraSprintField(value: unknown): JiraSprint[] {
  if (value == null || value === "") return [];

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.includes("com.atlassian.greenhopper.service.sprint.Sprint")) {
      const one = parseGreenhopperSprint(trimmed);
      return one ? [one] : [];
    }
    const one = sprintFromParts({ name: trimmed });
    return one ? [one] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((v) => parseJiraSprintField(v));
  }

  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const rawId =
      typeof o.id === "number"
        ? o.id
        : typeof o.id === "string"
          ? Number(o.id)
          : undefined;
    const one = sprintFromParts({
      id: rawId != null && Number.isFinite(rawId) ? rawId : undefined,
      name: typeof o.name === "string" ? o.name : undefined,
      state: typeof o.state === "string" ? o.state : undefined,
      startDate:
        typeof o.startDate === "string"
          ? o.startDate
          : typeof o.startDate === "number"
            ? new Date(o.startDate)
            : null,
      endDate:
        typeof o.endDate === "string"
          ? o.endDate
          : typeof o.endDate === "number"
            ? new Date(o.endDate)
            : null,
    });
    return one ? [one] : [];
  }

  return [];
}

/** Parse a single Jira CSV "Sprint" cell (usually just the sprint name). */
export function parseJiraSprintCsvCell(
  value: string | undefined | null
): JiraSprint | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.includes("com.atlassian.greenhopper.service.sprint.Sprint")) {
    return parseGreenhopperSprint(raw);
  }
  return sprintFromParts({ name: raw });
}

/**
 * Pick the sprint an issue currently belongs to: prefer active, else the
 * latest by end/start date (typical Jira "current sprint" semantics when
 * history keeps closed sprints on the field).
 */
export function pickCurrentSprint(sprints: JiraSprint[]): JiraSprint | null {
  if (!sprints.length) return null;
  const active = sprints.find((s) => s.state === "active");
  if (active) return active;
  const ranked = [...sprints].sort((a, b) => {
    const at = (a.endDate ?? a.startDate)?.getTime() ?? 0;
    const bt = (b.endDate ?? b.startDate)?.getTime() ?? 0;
    return bt - at;
  });
  return ranked[0] ?? null;
}

export function mapSprintToCycleStatus(
  state: JiraSprint["state"]
): "planned" | "active" | "completed" {
  if (state === "active") return "active";
  if (state === "closed") return "completed";
  return "planned";
}

/** Sort sprints chronologically so imported cycle numbers follow Jira order. */
export function sortSprintsChronologically(sprints: JiraSprint[]): JiraSprint[] {
  return [...sprints].sort((a, b) => {
    const at = a.startDate?.getTime() ?? a.endDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bt = b.startDate?.getTime() ?? b.endDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (at !== bt) return at - bt;
    if (a.jiraId != null && b.jiraId != null && a.jiraId !== b.jiraId) {
      return a.jiraId - b.jiraId;
    }
    return a.name.localeCompare(b.name);
  });
}
