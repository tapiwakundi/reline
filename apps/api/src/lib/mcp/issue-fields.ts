import {
  ISSUE_DESCRIPTION_GUIDE,
  ISSUE_TYPES,
  PRIORITIES,
  normalizeIssueMarkdown,
  type IssueType,
} from "@reline/shared";
import {
  joinProblems,
  parseAttachmentUploads,
  type McpAttachmentSource,
} from "@/lib/mcp/attachment-input";
import { parseIssueRef, splitIssueKey } from "@/lib/mcp/parse-link";

export { ISSUE_DESCRIPTION_GUIDE, joinProblems };

export const TITLE_MAX = 512;
export const DESCRIPTION_MAX = 100_000;

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type AssigneeInput =
  | { kind: "clear" }
  | { kind: "me" }
  | { kind: "query"; query: string };

export type CycleInput = { kind: "clear" } | { kind: "query"; query: string };

export type EpicInput = { kind: "clear" } | { kind: "query"; query: string };

export type IssueKeyInput = {
  identifier: string;
  slug?: string;
};

export type EpicCandidate = {
  id: string;
  identifier: string;
  title: string;
  type: IssueType;
};

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
  epic?: EpicInput;
  issues?: IssueKeyInput[];
  attachments?: McpAttachmentSource[];
};

const CLEAR_ASSIGNEE = new Set(["none", "unassigned", "nobody", "no one"]);
const CLEAR_CYCLE = new Set(["none", "no cycle", "unassigned"]);
const ACTIVE_CYCLE = new Set(["active", "current"]);
const CLEAR_EPIC = new Set(["none", "no epic"]);
const TYPE_ERROR = "Type must be epic, story, task, or bug.";
export const ATTACH_REQUIRES_EPIC =
  "Only an epic can have tickets attached. Set type to epic, or set the epic field on each ticket.";
const MAX_ATTACHED_ISSUES = 50;

export function parseIssueWriteArgs(
  args: unknown,
  mode: "create" | "update"
): FieldResult<IssueWriteInput> {
  const draft = parseIssueWriteDraft(args, mode);
  if (draft.errors.length) return { ok: false, error: joinProblems(draft.errors) };
  return { ok: true, value: draft.value };
}

/**
 * Parse every field and keep going past bad ones, so a client can fix all of
 * its mistakes in one retry. `value` holds only the fields that parsed.
 */
export function parseIssueWriteDraft(
  args: unknown,
  mode: "create" | "update"
): { value: IssueWriteInput; errors: string[] } {
  const input: IssueWriteInput = {};
  const errors: string[] = [];
  if (args === undefined) args = {};
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { value: input, errors: ["Tool arguments must be an object."] };
  }
  const record = args as Record<string, unknown>;

  const url = optionalText(record, "url");
  if (!url.ok) errors.push(url.error);
  else if (url.value) input.url = url.value;

  const identifier = optionalText(record, "identifier");
  if (!identifier.ok) errors.push(identifier.error);
  else if (identifier.value) input.identifier = identifier.value;

  const workspace = optionalText(record, "workspace");
  if (!workspace.ok) errors.push(workspace.error);
  else if (workspace.value) input.workspace = workspace.value;

  if (hasOwn(record, "title")) {
    const title =
      typeof record.title === "string"
        ? cleanTitle(record.title)
        : ({ ok: false, error: "Title must be a string." } as const);
    if (!title.ok) errors.push(title.error);
    else input.title = title.value;
  }

  if (hasOwn(record, "description")) {
    const description =
      typeof record.description === "string"
        ? cleanDescription(record.description)
        : ({ ok: false, error: "Description must be a string." } as const);
    if (!description.ok) errors.push(description.error);
    else input.description = description.value;
  }

  if (hasOwn(record, "status")) {
    if (typeof record.status !== "string" || !record.status.trim()) {
      errors.push("Status must be a name, such as Todo or In Progress.");
    } else {
      input.status = record.status.trim();
    }
  }

  if (hasOwn(record, "priority")) {
    const priority = parsePriority(record.priority);
    if (!priority.ok) errors.push(priority.error);
    else input.priority = priority.value;
  }

  if (hasOwn(record, "type")) {
    const type = parseIssueType(record.type);
    if (!type.ok) errors.push(type.error);
    else input.type = type.value;
  }

  if (hasOwn(record, "assignee")) {
    const assignee = parseAssignee(record.assignee);
    if (!assignee.ok) errors.push(assignee.error);
    else input.assignee = assignee.value;
  }

  if (hasOwn(record, "labels")) {
    const labels = parseLabels(record.labels);
    if (!labels.ok) errors.push(labels.error);
    else input.labels = labels.value;
  }

  if (hasOwn(record, "cycle")) {
    const cycle = parseCycle(record.cycle);
    if (!cycle.ok) errors.push(cycle.error);
    else input.cycle = cycle.value;
  }

  if (hasOwn(record, "epic")) {
    const epic = parseEpic(record.epic);
    if (!epic.ok) errors.push(epic.error);
    else input.epic = epic.value;
  }

  if (hasOwn(record, "issues")) {
    const issues = parseIssueKeys(record.issues);
    if (!issues.ok) errors.push(issues.error);
    else input.issues = issues.value;
  }

  if (hasOwn(record, "attachments")) {
    const attachments = parseAttachmentUploads(record.attachments);
    if (!attachments.ok) errors.push(...attachments.errors);
    else if (attachments.value.length) input.attachments = attachments.value;
  }

  if (input.type === "epic" && input.epic?.kind === "query") {
    errors.push("An epic cannot belong to another epic.");
  }
  if (input.issues && input.type && input.type !== "epic") {
    errors.push(ATTACH_REQUIRES_EPIC);
  }

  if (mode === "create" && !hasOwn(record, "title")) {
    errors.push("Title is required.");
  }

  if (mode === "update") {
    if (!input.url && !input.identifier) {
      errors.push("Pass a Reline issue URL or an identifier like REL-42.");
    }
    const changing =
      input.title !== undefined ||
      input.description !== undefined ||
      input.status !== undefined ||
      input.priority !== undefined ||
      input.type !== undefined ||
      input.assignee !== undefined ||
      input.labels !== undefined ||
      input.cycle !== undefined ||
      input.epic !== undefined ||
      input.issues !== undefined ||
      input.attachments !== undefined;
    if (!changing && !errors.length) {
      errors.push(
        "Pass at least one field to change, such as title, description, status, or attachments."
      );
    }
  }

  return { value: input, errors };
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
    return { ok: false, error: TYPE_ERROR };
  }
  const trimmed = value.trim().toLowerCase();
  const match = ISSUE_TYPES.find(
    (item) => item.value === trimmed || item.label.toLowerCase() === trimmed
  );
  if (!match) return { ok: false, error: TYPE_ERROR };
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

export function parseEpic(value: unknown): FieldResult<EpicInput> {
  if (value === null) return { ok: true, value: { kind: "clear" } };
  if (typeof value !== "string") {
    return { ok: false, error: "Epic must be an issue key, a title, or none." };
  }
  const trimmed = value.trim();
  if (!trimmed || CLEAR_EPIC.has(trimmed.toLowerCase())) {
    return { ok: true, value: { kind: "clear" } };
  }
  return { ok: true, value: { kind: "query", query: trimmed } };
}

export function parseIssueKeys(value: unknown): FieldResult<IssueKeyInput[]> {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return { ok: false, error: "Issues must be an array of issue keys or URLs." };
  }
  if (value.length > MAX_ATTACHED_ISSUES) {
    return { ok: false, error: `Attach at most ${MAX_ATTACHED_ISSUES} issues at a time.` };
  }
  const keys: IssueKeyInput[] = [];
  for (const item of value) {
    const ref = parseIssueRef(item);
    if (!ref) {
      const shown = item.trim() || item;
      return {
        ok: false,
        error: `"${shown}" is not an issue key. Expected something like REL-42.`,
      };
    }
    keys.push(ref.slug ? { identifier: ref.identifier, slug: ref.slug } : { identifier: ref.identifier });
  }
  if (!keys.length) {
    return { ok: false, error: "Pass at least one issue key to attach, such as REL-42." };
  }
  return { ok: true, value: keys };
}

/**
 * Resolve an epic link against issues in one workspace. A key or URL must
 * point at an epic. Anything else matches an epic title.
 */
export function resolveEpicSelection(
  rows: EpicCandidate[],
  epic: EpicInput,
  workspace: { slug: string; prefix: string }
): FieldResult<string | null> {
  if (epic.kind === "clear") return { ok: true, value: null };

  const ref = parseIssueRef(epic.query);
  if (ref) {
    if (ref.slug && !sameSlug(workspace.slug, ref.slug)) {
      return { ok: false, error: "That epic link is for a different workspace." };
    }
    const key = splitIssueKey(ref.identifier);
    if (!key || !samePrefix(workspace.prefix, key.prefix)) {
      return { ok: false, error: missingEpic(epic.query.trim(), rows) };
    }
    const row = rows.find((item) => splitIssueKey(item.identifier)?.number === key.number);
    if (!row) {
      return { ok: false, error: missingEpic(`${workspace.prefix}-${key.number}`, rows) };
    }
    if (row.type !== "epic") {
      const label = ISSUE_TYPES.find((item) => item.value === row.type)?.label ?? row.type;
      return { ok: false, error: `${row.identifier} is a ${label}, not an epic.` };
    }
    return { ok: true, value: row.id };
  }

  const needle = epic.query.trim().toLowerCase();
  const matches = rows.filter(
    (row) => row.type === "epic" && row.title.trim().toLowerCase() === needle
  );
  if (matches.length === 1) return { ok: true, value: matches[0]!.id };
  if (matches.length > 1) {
    return { ok: false, error: `"${epic.query.trim()}" matches more than one epic.` };
  }
  return { ok: false, error: missingEpic(epic.query.trim(), rows) };
}

export function parseCycle(value: unknown): FieldResult<CycleInput> {
  if (value === null) return { ok: true, value: { kind: "clear" } };
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return { ok: true, value: { kind: "query", query: String(value) } };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "Cycle must be a name, a number, active, or none." };
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
  const missing: string[] = [];
  let firstError = "";
  for (const name of names) {
    const match = matchByName(labels, name, "label");
    if (!match.ok) {
      firstError ||= match.error;
      if (labels.some((label) => label.name.trim().toLowerCase() === name.toLowerCase())) {
        return match;
      }
      missing.push(name);
    } else if (!ids.includes(match.value.id)) {
      ids.push(match.value.id);
    }
  }
  if (missing.length === 1) return { ok: false, error: firstError };
  if (missing.length) {
    const available = uniqueNames(labels.map((label) => label.name));
    const quoted = missing.map((name) => `"${name}"`).join(", ");
    return {
      ok: false,
      error: available.length
        ? `No labels named ${quoted}. Available: ${available.join(", ")}.`
        : "This workspace has no labels.",
    };
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
  // The most exact form wins, so a full name still beats someone's first name.
  const tiers = [
    members.filter((member) => member.email.toLowerCase() === needle),
    members.filter((member) => member.name.trim().toLowerCase() === needle),
    members.filter(
      (member) =>
        member.name.trim().toLowerCase().split(/\s+/).includes(needle) ||
        member.email.toLowerCase().split("@")[0] === needle
    ),
  ];
  for (const tier of tiers) {
    if (tier.length === 1) return { ok: true, value: tier[0]!.id };
    if (tier.length > 1) {
      const options = tier.map((member) => `${member.name} (${member.email})`).join(", ");
      return { ok: false, error: `"${assignee.query}" matches more than one member: ${options}.` };
    }
  }
  const names = uniqueNames(members.map((member) => member.name));
  return { ok: false, error: missingNamed("member", assignee.query, names) };
}

export function matchCycle(
  cycles: { id: string; name: string; number: number }[],
  cycle: CycleInput,
  activeId: string | null = null
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
  if (ACTIVE_CYCLE.has(query.toLowerCase())) {
    if (activeId) return { ok: true, value: activeId };
    return { ok: false, error: "This workspace has no active cycle." };
  }
  const names = uniqueNames(cycles.map((item) => `${item.number} · ${item.name}`));
  return { ok: false, error: missingNamed("cycle", query, names) };
}

function sameSlug(stored: string, given: string): boolean {
  return stored === given || stored.toLowerCase() === given.toLowerCase();
}

function samePrefix(stored: string, given: string): boolean {
  return stored.toLowerCase() === given.toLowerCase();
}

function missingEpic(query: string, rows: EpicCandidate[]): string {
  const names = uniqueNames(
    rows
      .filter((row) => row.type === "epic")
      .map((row) => `${row.identifier} · ${row.title}`)
  );
  if (!names.length) return "This workspace has no epics.";
  return `No epic matching "${query}". Available: ${names.join(", ")}.`;
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
