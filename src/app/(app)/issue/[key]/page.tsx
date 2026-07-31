import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, activities, issues, attachments } from "@/db/schema";
import { requireWorkspace } from "@/lib/session";
import { publicUrl } from "@/lib/r2";
import { IssueDetail } from "@/components/issues/issue-detail";

export default async function IssuePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { workspace } = await requireWorkspace();

  const match = key.match(/^(.+)-(\d+)$/);
  if (!match) notFound();
  const number = Number(match[2]);

  const issue = await db.query.issues.findFirst({
    where: and(eq(issues.workspaceId, workspace.id), eq(issues.number, number)),
    with: { labels: true },
  });
  if (!issue) notFound();

  const [commentRows, activityRows, attachmentRows] = await Promise.all([
    db.query.comments.findMany({
      where: eq(comments.issueId, issue.id),
      with: { author: true },
      orderBy: asc(comments.createdAt),
    }),
    db.query.activities.findMany({
      where: eq(activities.issueId, issue.id),
      with: { actor: true },
      orderBy: asc(activities.createdAt),
    }),
    db.query.attachments.findMany({
      where: eq(attachments.issueId, issue.id),
      orderBy: asc(attachments.createdAt),
    }),
  ]);

  const toSaved = (a: (typeof attachmentRows)[number]) => ({
    id: a.id,
    url: publicUrl(a.key),
    filename: a.filename,
    kind: a.kind,
  });
  const issueAttachments = attachmentRows
    .filter((a) => a.commentId === null)
    .map(toSaved);
  const commentAttachments = new Map<string, ReturnType<typeof toSaved>[]>();
  for (const a of attachmentRows) {
    if (!a.commentId) continue;
    const list = commentAttachments.get(a.commentId) ?? [];
    list.push(toSaved(a));
    commentAttachments.set(a.commentId, list);
  }

  return (
    <IssueDetail
      issue={{
        id: issue.id,
        identifier: `${workspace.prefix}-${issue.number}`,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        statusId: issue.statusId,
        assigneeId: issue.assigneeId,
        cycleId: issue.cycleId,
        labelIds: issue.labels.map((l) => l.labelId),
        createdAt: issue.createdAt.toISOString(),
        attachments: issueAttachments,
      }}
      comments={commentRows.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        author: c.author
          ? { id: c.author.id, name: c.author.name, email: c.author.email, image: c.author.image ?? null }
          : null,
        attachments: commentAttachments.get(c.id) ?? [],
      }))}
      activities={activityRows.map((a) => ({
        id: a.id,
        type: a.type,
        data: a.data ?? {},
        createdAt: a.createdAt.toISOString(),
        actor: a.actor
          ? { id: a.actor.id, name: a.actor.name, email: a.actor.email, image: a.actor.image ?? null }
          : null,
      }))}
    />
  );
}
