import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { issues, statuses, user } from "@/db/schema";
import { joinProblems } from "@/lib/mcp/attachment-input";
import { formatIssueList } from "@/lib/mcp/format";
import { parseListIssuesArgs, resolveStatusFilter } from "@/lib/mcp/issue-fields";
import {
  membershipForUser,
  priorityLabel,
  publicIssueUrl,
} from "@/lib/mcp/load-issue";
import type { McpToolResult } from "@/lib/mcp/types";
import { resolveFields } from "@/lib/mcp/write-issue";

export async function listIssuesTool(
  userId: string,
  args: unknown
): Promise<McpToolResult> {
  const parsed = parseListIssuesArgs(args);
  if (!parsed.ok) return toolError(parsed.error);
  const input = parsed.value;

  try {
    const target = await membershipForUser(userId, input.workspace);
    if (!target.ok) return toolError(target.error);
    const { workspace } = target.value;

    const [statusRows, resolved] = await Promise.all([
      db.query.statuses.findMany({ where: eq(statuses.workspaceId, workspace.id) }),
      resolveFields(userId, workspace, { assignee: input.assignee, cycle: input.cycle }),
    ]);
    statusRows.sort((a, b) => a.position - b.position);
    const statusIds = resolveStatusFilter(statusRows, input.status);
    const errors = [...resolved.errors, ...(statusIds.ok ? [] : [statusIds.error])];
    if (!statusIds.ok || errors.length) return toolError(joinProblems(errors));

    const { assigneeId, cycleId } = resolved.value;
    const where = and(
      eq(issues.workspaceId, workspace.id),
      statusIds.value ? inArray(issues.statusId, statusIds.value) : undefined,
      input.type ? eq(issues.type, input.type) : undefined,
      assigneeId === undefined
        ? undefined
        : assigneeId === null
          ? isNull(issues.assigneeId)
          : eq(issues.assigneeId, assigneeId),
      cycleId === undefined
        ? undefined
        : cycleId === null
          ? isNull(issues.cycleId)
          : eq(issues.cycleId, cycleId)
    );

    const [rows, totals] = await Promise.all([
      db
        .select({
          number: issues.number,
          title: issues.title,
          priority: issues.priority,
          statusName: statuses.name,
          assigneeName: user.name,
        })
        .from(issues)
        .innerJoin(statuses, eq(issues.statusId, statuses.id))
        .leftJoin(user, eq(issues.assigneeId, user.id))
        .where(where)
        .orderBy(desc(issues.updatedAt), desc(issues.number))
        .limit(input.limit),
      db.select({ value: count() }).from(issues).where(where),
    ]);

    const items = rows.map((row) => {
      const identifier = `${workspace.prefix}-${row.number}`;
      return {
        identifier,
        title: row.title,
        statusName: row.statusName,
        priorityLabel: priorityLabel(row.priority),
        assigneeName: row.assigneeName,
        url: publicIssueUrl(workspace.slug, identifier),
      };
    });
    return {
      content: [
        { type: "text", text: formatIssueList(items, totals[0]?.value ?? 0, workspace) },
      ],
    };
  } catch (error) {
    console.error(error);
    return toolError("Could not list issues.");
  }
}

function toolError(text: string): McpToolResult {
  return { content: [{ type: "text", text }], isError: true };
}
