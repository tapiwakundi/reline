import type { IssueType, IssueUpdatePatch } from "@reline/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cycles, issues, labels, memberships, statuses, user as users } from "@/db/schema";
import { HttpError, type WorkspaceContext } from "@/lib/context";
import { formatIssue } from "@/lib/mcp/format";
import {
  ATTACH_REQUIRES_EPIC,
  matchAssignee,
  matchByName,
  matchCycle,
  matchLabels,
  parseIssueWriteArgs,
  resolveEpicSelection,
  type EpicCandidate,
  type IssueKeyInput,
  type IssueWriteInput,
} from "@/lib/mcp/issue-fields";
import {
  loadIssueForUser,
  loadIssueRecordForUser,
  membershipForUser,
  type LoadedIssueRecord,
} from "@/lib/mcp/load-issue";
import { parseIssueRef, splitIssueKey, type IssueRef } from "@/lib/mcp/parse-link";
import type { McpToolResult } from "@/lib/mcp/types";
import { bulkUpdateIssues, createIssue, updateIssue } from "@/services/issues";

type WorkspaceRow = LoadedIssueRecord["workspace"];
type MembershipRow = LoadedIssueRecord["membership"];

export async function createIssueTool(
  userId: string,
  args: unknown
): Promise<McpToolResult> {
  const parsed = parseIssueWriteArgs(args, "create");
  if (!parsed.ok) return toolError(parsed.error);

  const located = await membershipForUser(userId, parsed.value.workspace);
  if (!located.ok) return toolError(located.error);

  try {
    const resolved = await resolveFields(userId, located.value.workspace, parsed.value);
    if (!resolved.ok) return toolError(resolved.error);
    if (!resolved.value.title) return toolError("Title is required.");

    const creatingEpic = (resolved.value.type ?? "story") === "epic";
    if (parsed.value.issues && !creatingEpic) return toolError(ATTACH_REQUIRES_EPIC);
    const attachIds = parsed.value.issues
      ? await resolveAttachIds(located.value.workspace, parsed.value.issues)
      : null;
    if (attachIds && !attachIds.ok) return toolError(attachIds.error);

    const ctx = await workspaceContext(
      userId,
      located.value.workspace,
      located.value.membership
    );
    if (!ctx) return toolError("Could not create that issue.");

    const created = await createIssue(ctx, {
      title: resolved.value.title,
      description: resolved.value.description,
      statusId: resolved.value.statusId,
      priority: resolved.value.priority,
      type: resolved.value.type,
      assigneeId: resolved.value.assigneeId,
      cycleId: resolved.value.cycleId,
      epicId: resolved.value.epicId,
      labelIds: resolved.value.labelIds,
    });
    if (attachIds?.ok && attachIds.value.length) {
      await bulkUpdateIssues(ctx, attachIds.value, { epicId: created.id });
    }
    return presentIssue(
      userId,
      { identifier: created.identifier, slug: located.value.workspace.slug },
      "Created"
    );
  } catch (error) {
    return failure(error, "Could not create that issue.");
  }
}

export async function updateIssueTool(
  userId: string,
  args: unknown
): Promise<McpToolResult> {
  const parsed = parseIssueWriteArgs(args, "update");
  if (!parsed.ok) return toolError(parsed.error);

  const ref = issueRef(parsed.value);
  if (!ref.ok) return toolError(ref.error);

  try {
    const loaded = await loadIssueRecordForUser(userId, ref.value);
    if (!loaded.ok) return toolError(loaded.error);

    const resolved = await resolveFields(
      userId,
      loaded.value.workspace,
      parsed.value,
      loaded.value.issueType
    );
    if (!resolved.ok) return toolError(resolved.error);

    const nextType = resolved.value.type ?? loaded.value.issueType;
    if (parsed.value.issues && nextType !== "epic") return toolError(ATTACH_REQUIRES_EPIC);
    const attachIds = parsed.value.issues
      ? await resolveAttachIds(
          loaded.value.workspace,
          parsed.value.issues,
          loaded.value.issueId
        )
      : null;
    if (attachIds && !attachIds.ok) return toolError(attachIds.error);

    const ctx = await workspaceContext(
      userId,
      loaded.value.workspace,
      loaded.value.membership
    );
    if (!ctx) return toolError("Could not update that issue.");

    await updateIssue(ctx, loaded.value.issueId, resolved.value);
    if (attachIds?.ok && attachIds.value.length) {
      await bulkUpdateIssues(ctx, attachIds.value, { epicId: loaded.value.issueId });
    }
    return presentIssue(userId, ref.value, "Updated");
  } catch (error) {
    return failure(error, "Could not update that issue.");
  }
}

async function resolveFields(
  userId: string,
  workspace: { id: string; slug: string; prefix: string },
  input: IssueWriteInput,
  currentType?: IssueType
) {
  const workspaceId = workspace.id;
  const resolved: IssueUpdatePatch = {};
  if (input.title !== undefined) resolved.title = input.title;
  if (input.description !== undefined) resolved.description = input.description;
  if (input.priority !== undefined) resolved.priority = input.priority;
  if (input.type !== undefined) resolved.type = input.type;

  if (input.epic !== undefined) {
    const nextType = input.type ?? currentType ?? "story";
    if (nextType === "epic" && input.epic.kind === "query") {
      return { ok: false as const, error: "An epic cannot belong to another epic." };
    }
    if (input.epic.kind === "clear") {
      resolved.epicId = null;
    } else {
      const rows = await epicRowsForQuery(workspace, input.epic.query);
      const match = resolveEpicSelection(rows, input.epic, workspace);
      if (!match.ok) return match;
      resolved.epicId = match.value;
    }
  }

  if (input.status !== undefined) {
    const rows = await db.query.statuses.findMany({
      where: eq(statuses.workspaceId, workspaceId),
    });
    rows.sort((a, b) => a.position - b.position);
    const match = matchByName(rows, input.status, "status");
    if (!match.ok) return match;
    resolved.statusId = match.value.id;
  }

  if (input.labels !== undefined) {
    const rows = await db.query.labels.findMany({
      where: eq(labels.workspaceId, workspaceId),
    });
    const match = matchLabels(rows, input.labels);
    if (!match.ok) return match;
    resolved.labelIds = match.value;
  }

  if (input.assignee !== undefined) {
    const rows = await db.query.memberships.findMany({
      where: eq(memberships.workspaceId, workspaceId),
      with: { user: true },
    });
    const members = rows.flatMap((row) =>
      row.user
        ? [{ id: row.user.id, name: row.user.name, email: row.user.email }]
        : []
    );
    const match = matchAssignee(members, input.assignee, userId);
    if (!match.ok) return match;
    resolved.assigneeId = match.value;
  }

  if (input.cycle !== undefined) {
    const rows = await db.query.cycles.findMany({
      where: eq(cycles.workspaceId, workspaceId),
    });
    const match = matchCycle(
      rows.map((row) => ({ id: row.id, name: row.name, number: row.number })),
      input.cycle
    );
    if (!match.ok) return match;
    resolved.cycleId = match.value;
  }

  return { ok: true as const, value: resolved };
}

async function epicRowsForQuery(
  workspace: { id: string; slug: string; prefix: string },
  query: string
): Promise<EpicCandidate[]> {
  const ref = parseIssueRef(query);
  if (ref && (!ref.slug || sameSlug(workspace.slug, ref.slug))) {
    const key = splitIssueKey(ref.identifier);
    if (key && samePrefix(workspace.prefix, key.prefix)) {
      const row = await db.query.issues.findFirst({
        where: and(eq(issues.workspaceId, workspace.id), eq(issues.number, key.number)),
        columns: { id: true, number: true, title: true, type: true },
      });
      if (row) return [toEpicCandidate(workspace.prefix, row)];
    }
  }

  const epics = await db.query.issues.findMany({
    where: and(eq(issues.workspaceId, workspace.id), eq(issues.type, "epic")),
    columns: { id: true, number: true, title: true, type: true },
    orderBy: asc(issues.number),
  });
  return epics.map((row) => toEpicCandidate(workspace.prefix, row));
}

function toEpicCandidate(
  prefix: string,
  row: { id: string; number: number; title: string; type: IssueType }
): EpicCandidate {
  return {
    id: row.id,
    identifier: `${prefix}-${row.number}`,
    title: row.title,
    type: row.type,
  };
}

async function resolveAttachIds(
  workspace: { id: string; slug: string; prefix: string },
  keys: IssueKeyInput[],
  selfId?: string
): Promise<{ ok: true; value: string[] } | { ok: false; error: string }> {
  for (const key of keys) {
    if (key.slug && !sameSlug(workspace.slug, key.slug)) {
      return { ok: false, error: `${key.identifier} is in a different workspace.` };
    }
    const parts = splitIssueKey(key.identifier);
    if (!parts || !samePrefix(workspace.prefix, parts.prefix)) {
      return { ok: false, error: `No issue ${key.identifier} in this workspace.` };
    }
  }

  const numbers = [
    ...new Set(keys.map((key) => splitIssueKey(key.identifier)!.number)),
  ];
  const rows = await db.query.issues.findMany({
    where: and(eq(issues.workspaceId, workspace.id), inArray(issues.number, numbers)),
    columns: { id: true, number: true, type: true },
  });
  const byNumber = new Map(rows.map((row) => [row.number, row]));
  const ids: string[] = [];
  for (const key of keys) {
    const number = splitIssueKey(key.identifier)!.number;
    const row = byNumber.get(number);
    const identifier = `${workspace.prefix}-${number}`;
    if (!row) return { ok: false, error: `No issue ${identifier} in this workspace.` };
    if (row.type === "epic") {
      return {
        ok: false,
        error: `${identifier} is an epic and cannot belong to another epic.`,
      };
    }
    if (selfId && row.id === selfId) {
      return { ok: false, error: "An issue cannot belong to itself." };
    }
    if (!ids.includes(row.id)) ids.push(row.id);
  }
  return { ok: true, value: ids };
}

function sameSlug(stored: string, given: string): boolean {
  return stored === given || stored.toLowerCase() === given.toLowerCase();
}

function samePrefix(stored: string, given: string): boolean {
  return stored.toLowerCase() === given.toLowerCase();
}

async function workspaceContext(
  userId: string,
  workspace: WorkspaceRow,
  membership: MembershipRow
): Promise<WorkspaceContext | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
    },
    membership,
    workspace,
  };
}

function issueRef(input: IssueWriteInput): { ok: true; value: IssueRef } | { ok: false; error: string } {
  const ref = input.url
    ? parseIssueRef(input.url)
    : parseIssueRef(input.identifier ?? "");
  if (!ref) {
    return {
      ok: false,
      error: input.url
        ? "That URL is not a Reline issue link. Expected a path like /acme/issue/REL-42."
        : "Identifier should look like REL-42.",
    };
  }
  if (!input.url && input.workspace) ref.slug = input.workspace;
  return { ok: true, value: ref };
}

async function presentIssue(
  userId: string,
  ref: IssueRef,
  verb: "Created" | "Updated"
): Promise<McpToolResult> {
  const loaded = await loadIssueForUser(userId, ref);
  if (!loaded.ok) {
    return { content: [{ type: "text", text: `${verb}. ${loaded.error}` }] };
  }
  return {
    content: [
      {
        type: "text",
        text: `${verb} ${loaded.value.identifier}.\n\n${formatIssue(loaded.value, new Set())}`,
      },
    ],
  };
}

function failure(error: unknown, fallback: string): McpToolResult {
  if (error instanceof HttpError) return toolError(error.message);
  console.error(error);
  return toolError(fallback);
}

function toolError(text: string): McpToolResult {
  return { content: [{ type: "text", text }], isError: true };
}
