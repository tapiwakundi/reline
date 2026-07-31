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
