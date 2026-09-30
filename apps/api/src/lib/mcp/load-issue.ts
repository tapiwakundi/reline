import { ISSUE_TYPES, PRIORITIES } from "@reline/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  comments,
  cycles,
  issueLabels,
  issues,
  labels,
  memberships,
  statuses,
  user,
  workspaces,
} from "@/db/schema";
import { splitIssueKey, type IssueRef } from "@/lib/mcp/parse-link";
import type {
  McpAttachment,
  McpComment,
  McpIssue,
  McpPerson,
} from "@/lib/mcp/types";

export type LoadFailure = { ok: false; error: string };
export type LoadSuccess<T> = { ok: true; value: T };
export type LoadResult<T> = LoadSuccess<T> | LoadFailure;

type WorkspaceRow = typeof workspaces.$inferSelect;

export async function loadIssueForUser(
  userId: string,
  ref: IssueRef
): Promise<LoadResult<McpIssue>> {
  const key = splitIssueKey(ref.identifier);
  if (!key) {
    return { ok: false, error: "That is not a Reline issue key. Expected something like REL-42." };
  }

  const membershipRows = await db.query.memberships.findMany({
    where: eq(memberships.userId, userId),
    with: { workspace: true },
  });
  const accessible = membershipRows.map((row) => row.workspace);

  let workspace: WorkspaceRow | undefined;
  if (ref.slug) {
    workspace = accessible.find((item) => slugsMatch(item.slug, ref.slug!));
    if (!workspace || !prefixesMatch(workspace.prefix, key.prefix)) {
      return { ok: false, error: "No issue was found for that link." };
    }
  } else {
    const matches = accessible.filter((item) =>
      prefixesMatch(item.prefix, key.prefix)
    );
    if (matches.length === 0) {
      return {
        ok: false,
        error: `No issue ${ref.identifier.trim()} was found in a workspace you can access.`,
      };
    }
    if (matches.length > 1) {
      const list = matches
        .map((item) => `${item.name} (${item.slug})`)
        .join(", ");
      return {
        ok: false,
        error: `${key.prefix}-${key.number} matches more than one workspace: ${list}. Paste the full issue URL or pass the workspace slug.`,
      };
    }
    workspace = matches[0];
  }

  if (!workspace) {
    return { ok: false, error: "No issue was found for that link." };
  }

  const issue = await db.query.issues.findFirst({
    where: and(
      eq(issues.workspaceId, workspace.id),
      eq(issues.number, key.number)
    ),
  });
  if (!issue) {
    return { ok: false, error: "No issue was found for that link." };
  }

  const [status, cycle, labelRows, commentRows, attachmentRows, people] =
    await Promise.all([
      db.query.statuses.findFirst({
        where: eq(statuses.id, issue.statusId),
      }),
      issue.cycleId
        ? db.query.cycles.findFirst({ where: eq(cycles.id, issue.cycleId) })
        : Promise.resolve(null),
      db
        .select({ name: labels.name })
        .from(issueLabels)
        .innerJoin(labels, eq(issueLabels.labelId, labels.id))
        .where(eq(issueLabels.issueId, issue.id)),
      db.query.comments.findMany({
        where: eq(comments.issueId, issue.id),
        with: { author: true },
        orderBy: asc(comments.createdAt),
      }),
      db.query.attachments.findMany({
        where: eq(attachments.issueId, issue.id),
        orderBy: asc(attachments.createdAt),
      }),
      loadPeople(
        [issue.assigneeId, issue.creatorId].filter((id): id is string => Boolean(id))
      ),
    ]);

  const mappedAttachments = attachmentRows.map(mapAttachment);
  const issueAttachments = mappedAttachments.filter(
    (attachment) =>
      attachmentRows.find((row) => row.id === attachment.id)?.commentId == null
  );
  const byComment = new Map<string, McpAttachment[]>();
  for (const row of attachmentRows) {
    if (!row.commentId) continue;
    const mapped = mappedAttachments.find((item) => item.id === row.id);
    if (!mapped) continue;
    const list = byComment.get(row.commentId) ?? [];
    list.push(mapped);
    byComment.set(row.commentId, list);
  }

  const identifier = `${workspace.prefix}-${issue.number}`;
  const view: McpIssue = {
    identifier,
    title: issue.title,
    description: issue.description,
    url: publicIssueUrl(workspace.slug, identifier),
    workspaceName: workspace.name,
    workspaceSlug: workspace.slug,
    statusName: status?.name ?? "Unknown",
    statusType: status?.type ?? "unstarted",
    priorityLabel: priorityLabel(issue.priority),
    typeLabel: typeLabel(issue.type),
    assignee: issue.assigneeId ? people.get(issue.assigneeId) ?? null : null,
    creator: issue.creatorId ? people.get(issue.creatorId) ?? null : null,
    cycle: cycle
      ? { number: cycle.number, name: cycle.name, status: cycle.status }
      : null,
    labels: labelRows.map((row) => row.name).sort((a, b) => a.localeCompare(b)),
    estimate: issue.estimate,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
    attachments: issueAttachments,
    comments: commentRows.map(
      (comment): McpComment => ({
        id: comment.id,
        parentId: comment.parentId,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        author: comment.author
          ? { name: comment.author.name, email: comment.author.email }
          : null,
        attachments: byComment.get(comment.id) ?? [],
      })
    ),
  };
  return { ok: true, value: view };
}

export async function loadAttachmentForUser(
  userId: string,
  attachmentId: string
): Promise<LoadResult<McpAttachment>> {
  const row = await db.query.attachments.findFirst({
    where: eq(attachments.id, attachmentId),
  });
  if (!row) {
    return { ok: false, error: "No attachment was found with that id." };
  }

  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, userId),
      eq(memberships.workspaceId, row.workspaceId)
    ),
  });
  if (!membership) {
    return { ok: false, error: "No attachment was found with that id." };
  }

  return { ok: true, value: mapAttachment(row) };
}

function mapAttachment(
  row: typeof attachments.$inferSelect
): McpAttachment {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    size: row.size,
    kind: row.kind,
    url: publicAttachmentUrl(row.key),
  };
}

export function publicAttachmentUrl(key: string): string | null {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!base || !/^https?:\/\//i.test(base)) return null;
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("\\") || key.includes("?")) {
    return null;
  }
  return `${base}/${key.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

export function publicIssueUrl(slug: string, identifier: string): string | null {
  const base = process.env.BETTER_AUTH_URL?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/${encodeURIComponent(slug)}/issue/${encodeURIComponent(identifier)}`;
}

async function loadPeople(ids: string[]): Promise<Map<string, McpPerson>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const rows = await db.select().from(user).where(inArray(user.id, unique));
  return new Map(
    rows.map((row) => [row.id, { name: row.name, email: row.email }])
  );
}

function slugsMatch(stored: string, given: string): boolean {
  return stored === given || stored.toLowerCase() === given.toLowerCase();
}

function prefixesMatch(stored: string, given: string): boolean {
  return stored.toLowerCase() === given.toLowerCase();
}

function priorityLabel(value: number): string {
  return PRIORITIES.find((item) => item.value === value)?.label ?? `Priority ${value}`;
}

function typeLabel(value: string): string {
  return ISSUE_TYPES.find((item) => item.value === value)?.label ?? value;
}
