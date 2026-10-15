import type { IssueUpdatePatch } from "@reline/shared";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cycles, labels, memberships, statuses, user as users } from "@/db/schema";
import { HttpError, type WorkspaceContext } from "@/lib/context";
import { formatIssue } from "@/lib/mcp/format";
import {
  matchAssignee,
  matchByName,
  matchCycle,
  matchLabels,
  parseIssueWriteArgs,
  type IssueWriteInput,
} from "@/lib/mcp/issue-fields";
import {
  loadIssueForUser,
  loadIssueRecordForUser,
  membershipForUser,
  type LoadedIssueRecord,
} from "@/lib/mcp/load-issue";
import { parseIssueRef, type IssueRef } from "@/lib/mcp/parse-link";
import type { McpToolResult } from "@/lib/mcp/types";
import { createIssue, updateIssue } from "@/services/issues";

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
    const resolved = await resolveFields(userId, located.value.workspace.id, parsed.value);
    if (!resolved.ok) return toolError(resolved.error);
    if (!resolved.value.title) return toolError("Title is required.");

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
      labelIds: resolved.value.labelIds,
    });
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

    const resolved = await resolveFields(userId, loaded.value.workspace.id, parsed.value);
    if (!resolved.ok) return toolError(resolved.error);

    const ctx = await workspaceContext(
      userId,
      loaded.value.workspace,
      loaded.value.membership
    );
    if (!ctx) return toolError("Could not update that issue.");

    await updateIssue(ctx, loaded.value.issueId, resolved.value);
    return presentIssue(userId, ref.value, "Updated");
  } catch (error) {
    return failure(error, "Could not update that issue.");
  }
}

async function resolveFields(
  userId: string,
  workspaceId: string,
  input: IssueWriteInput
) {
  const resolved: IssueUpdatePatch = {};
  if (input.title !== undefined) resolved.title = input.title;
  if (input.description !== undefined) resolved.description = input.description;
  if (input.priority !== undefined) resolved.priority = input.priority;
  if (input.type !== undefined) resolved.type = input.type;

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
