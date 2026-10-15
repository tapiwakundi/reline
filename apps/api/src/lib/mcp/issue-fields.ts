import {
  ISSUE_DESCRIPTION_GUIDE,
  ISSUE_TYPES,
  PRIORITIES,
  normalizeIssueMarkdown,
  type IssueType,
} from "@reline/shared";

export { ISSUE_DESCRIPTION_GUIDE };

export const TITLE_MAX = 512;
export const DESCRIPTION_MAX = 100_000;

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type AssigneeInput =
  | { kind: "clear" }
  | { kind: "me" }
  | { kind: "query"; query: string };

export type CycleInput = { kind: "clear" } | { kind: "query"; query: string };

export type IssueWriteInput = {
  url?: string;
  identifier?: string;
  workspace?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  type?: IssueType;
  assignee?: AssigneeInput;
  labels?: string[];
  cycle?: CycleInput;
};

const CLEAR_ASSIGNEE = new Set(["none", "unassigned", "nobody", "no one"]);
const CLEAR_CYCLE = new Set(["none", "no cycle", "unassigned"]);

export function parseIssueWriteArgs(
  args: unknown,
  mode: "create" | "update"
): FieldResult<IssueWriteInput> {
  if (args === undefined) args = {};
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, error: "Tool arguments must be an object." };
  }
  const record = args as Record<string, unknown>;
  const input: IssueWriteInput = {};

  const url = optionalText(record, "url");
  if (!url.ok) return url;
  if (url.value) input.url = url.value;

  const identifier = optionalText(record, "identifier");
  if (!identifier.ok) return identifier;
  if (identifier.value) input.identifier = identifier.value;

  const workspace = optionalText(record, "workspace");
  if (!workspace.ok) return workspace;
  if (workspace.value) input.workspace = workspace.value;

  if (hasOwn(record, "title")) {
    if (typeof record.title !== "string") {
      return { ok: false, error: "Title must be a string." };
    }
    const title = cleanTitle(record.title);
    if (!title.ok) return title;
    input.title = title.value;
  }

  if (hasOwn(record, "description")) {
    if (typeof record.description !== "string") {
      return { ok: false, error: "Description must be a string." };
    }
    const description = cleanDescription(record.description);
    if (!description.ok) return description;
    input.description = description.value;
  }

  if (hasOwn(record, "status")) {
    if (typeof record.status !== "string" || !record.status.trim()) {
      return { ok: false, error: "Status must be a name, such as Todo or In Progress." };
    }
    input.status = record.status.trim();
  }

  if (hasOwn(record, "priority")) {
    const priority = parsePriority(record.priority);
    if (!priority.ok) return priority;
    input.priority = priority.value;
  }

  if (hasOwn(record, "type")) {
    const type = parseIssueType(record.type);
    if (!type.ok) return type;
    input.type = type.value;
  }

  if (hasOwn(record, "assignee")) {
    const assignee = parseAssignee(record.assignee);
    if (!assignee.ok) return assignee;
    input.assignee = assignee.value;
  }

  if (hasOwn(record, "labels")) {
    const labels = parseLabels(record.labels);
    if (!labels.ok) return labels;
    input.labels = labels.value;
  }

  if (hasOwn(record, "cycle")) {
    const cycle = parseCycle(record.cycle);
    if (!cycle.ok) return cycle;
    input.cycle = cycle.value;
  }

  if (mode === "create" && !input.title) {
    return { ok: false, error: "Title is required." };
  }

  if (mode === "update") {
    if (!input.url && !input.identifier) {
      return { ok: false, error: "Pass a Reline issue URL or an identifier like REL-42." };
    }
    const changing =
      input.title !== undefined ||
      input.description !== undefined ||
      input.status !== undefined ||
      input.priority !== undefined ||
      input.type !== undefined ||
      input.assignee !== undefined ||
      input.labels !== undefined ||
      input.cycle !== undefined;
    if (!changing) {
      return {
        ok: false,
        error: "Pass at least one field to change, such as title, description, or status.",
      };
    }
  }

  return { ok: true, value: input };
}

export function cleanTitle(value: string): FieldResult<string> {
  const title = value.trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (title.length > TITLE_MAX) {
    return { ok: false, error: `Title must be ${TITLE_MAX} characters or fewer.` };
  }
  if (/[\u0000-\u001f]/.test(title)) {
    return { ok: false, error: "Title cannot contain line breaks." };
  }
  return { ok: true, value: title };
}

export function cleanDescription(value: string): FieldResult<string> {
  if (value.includes("\u0000")) {
    return { ok: false, error: "Description cannot contain null characters." };
  }
  if (value.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `Description must be ${DESCRIPTION_MAX} characters or fewer.`,
    };
  }
  const description = normalizeIssueMarkdown(value);
  if (description.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `Description must be ${DESCRIPTION_MAX} characters or fewer.`,
    };
  }
  return { ok: true, value: description };
}

export function parsePriority(value: unknown): FieldResult<number> {
  const labels = PRIORITIES.map((item) => item.label).join(", ");
  if (typeof value === "number" && PRIORITIES.some((item) => item.value === value)) {
    return { ok: true, value };
  }
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    const byLabel = PRIORITIES.find((item) => item.label.toLowerCase() === trimmed);
    if (byLabel) return { ok: true, value: byLabel.value };
    if (trimmed === "none" || trimmed === "no priority") return { ok: true, value: 0 };
    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (PRIORITIES.some((item) => item.value === numeric)) {
        return { ok: true, value: numeric };
      }
    }
  }
  return { ok: false, error: `Priority must be one of: ${labels}.` };
}

export function parseIssueType(value: unknown): FieldResult<IssueType> {
  if (typeof value !== "string") {
    return { ok: false, error: "Type must be story, task, or bug." };
  }
  const trimmed = value.trim().toLowerCase();
  const match = ISSUE_TYPES.find(
    (item) => item.value === trimmed || item.label.toLowerCase() === trimmed
  );
  if (!match) return { ok: false, error: "Type must be story, task, or bug." };
  return { ok: true, value: match.value };
}

export function parseAssignee(value: unknown): FieldResult<AssigneeInput> {
  if (value === null) return { ok: true, value: { kind: "clear" } };
  if (typeof value !== "string") {
    return { ok: false, error: "Assignee must be a member name, an email, me, or none." };
  }
  const trimmed = value.trim();
  if (!trimmed || CLEAR_ASSIGNEE.has(trimmed.toLowerCase())) {
    return { ok: true, value: { kind: "clear" } };
  }
  if (trimmed.toLowerCase() === "me") return { ok: true, value: { kind: "me" } };
  return { ok: true, value: { kind: "query", query: trimmed } };
}

export function parseLabels(value: unknown): FieldResult<string[]> {
  if (value === null) return { ok: true, value: [] };
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return { ok: false, error: "Labels must be an array of label names." };
  }
  const names = value.map((item) => item.trim()).filter(Boolean);
  return { ok: true, value: names };
}

export function parseCycle(value: unknown): FieldResult<CycleInput> {
  if (value === null) return { ok: true, value: { kind: "clear" } };
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return { ok: true, value: { kind: "query", query: String(value) } };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "Cycle must be a name, a number, or none." };
  }
  const trimmed = value.trim();
  if (!trimmed || CLEAR_CYCLE.has(trimmed.toLowerCase())) {
    return { ok: true, value: { kind: "clear" } };
  }
  return { ok: true, value: { kind: "query", query: trimmed } };
}

export function matchByName<T extends { name: string }>(
  items: T[],
  query: string,
  noun: string
): FieldResult<T> {
  const needle = query.trim().toLowerCase();
  const matches = items.filter((item) => item.name.trim().toLowerCase() === needle);
  if (matches.length === 1) return { ok: true, value: matches[0]! };
  const names = uniqueNames(items.map((item) => item.name));
  if (matches.length === 0) {
    return { ok: false, error: missingNamed(noun, query.trim(), names) };
  }
  return { ok: false, error: `"${query.trim()}" matches more than one ${noun}.` };
}

export function matchLabels(
  labels: { id: string; name: string }[],
  names: string[]
): FieldResult<string[]> {
  const ids: string[] = [];
  for (const name of names) {
    const match = matchByName(labels, name, "label");
    if (!match.ok) return match;
    if (!ids.includes(match.value.id)) ids.push(match.value.id);
  }
  return { ok: true, value: ids };
}

export function matchAssignee(
  members: { id: string; name: string; email: string }[],
  assignee: AssigneeInput,
  selfId: string
): FieldResult<string | null> {
  if (assignee.kind === "clear") return { ok: true, value: null };
  if (assignee.kind === "me") {
    if (!members.some((member) => member.id === selfId)) {
      return { ok: false, error: "You are not a member of that workspace." };
    }
    return { ok: true, value: selfId };
  }
  const needle = assignee.query.trim().toLowerCase();
  const byEmail = members.filter((member) => member.email.toLowerCase() === needle);
  if (byEmail.length === 1) return { ok: true, value: byEmail[0]!.id };
  const byName = members.filter((member) => member.name.trim().toLowerCase() === needle);
  if (byName.length === 1) return { ok: true, value: byName[0]!.id };
  if (byEmail.length + byName.length > 1) {
    return { ok: false, error: `"${assignee.query}" matches more than one member.` };
  }
  const names = uniqueNames(members.map((member) => member.name));
  return { ok: false, error: missingNamed("member", assignee.query, names) };
}

export function matchCycle(
  cycles: { id: string; name: string; number: number }[],
  cycle: CycleInput
): FieldResult<string | null> {
  if (cycle.kind === "clear") return { ok: true, value: null };
  const query = cycle.query.trim();
  const byName = cycles.filter((item) => item.name.trim().toLowerCase() === query.toLowerCase());
  if (byName.length === 1) return { ok: true, value: byName[0]!.id };
  if (byName.length > 1) {
    return { ok: false, error: `"${query}" matches more than one cycle.` };
  }
  const number = cycleNumber(query);
  if (number !== null) {
    const byNumber = cycles.filter((item) => item.number === number);
    if (byNumber.length === 1) return { ok: true, value: byNumber[0]!.id };
    if (byNumber.length > 1) {
      return { ok: false, error: `Cycle ${number} matches more than one cycle.` };
    }
  }
  const names = uniqueNames(cycles.map((item) => `${item.number} · ${item.name}`));
  return { ok: false, error: missingNamed("cycle", query, names) };
}

function cycleNumber(query: string): number | null {
  const match = /^(?:cycle\s+)?#?(\d+)$/i.exec(query.trim());
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1) return null;
  return number;
}

function optionalText(
  record: Record<string, unknown>,
  key: string
): FieldResult<string | undefined> {
  if (!hasOwn(record, key) || record[key] == null) return { ok: true, value: undefined };
  if (typeof record[key] !== "string") {
    return { ok: false, error: `${labelFor(key)} must be a string.` };
  }
  const trimmed = (record[key] as string).trim();
  return { ok: true, value: trimmed || undefined };
}

function labelFor(key: string): string {
  if (key === "url") return "URL";
  if (key === "identifier") return "Identifier";
  return "Workspace";
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push(name.trim());
  }
  return list.slice(0, 40);
}

function missingNamed(noun: string, query: string, names: string[]): string {
  if (!names.length) {
    if (noun === "status") return "This workspace has no statuses.";
    if (noun === "label") return "This workspace has no labels.";
    if (noun === "cycle") return "This workspace has no cycles.";
    if (noun === "member") return "This workspace has no members.";
    return `This workspace has no ${noun}.`;
  }
  return `No ${noun} named "${query}". Available: ${names.join(", ")}.`;
}
