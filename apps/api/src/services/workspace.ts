import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  attachments,
  invites,
  issues,
  memberships,
  notifications,
  slackUserLinks,
  statuses,
  workspaces,
} from "@/db/schema";
import { DEFAULT_STATUSES, type WorkspaceListItem } from "@reline/shared";
import { deleteObjects } from "@/lib/r2";
import { allocateUniqueSlug } from "@/lib/workspace-slug";
import { membershipRemoval } from "@/lib/membership-policy";
import { getUserWorkspaces } from "@/lib/session";
import { HttpError, type AuthUser, type WorkspaceContext } from "@/lib/context";

export async function createWorkspace(
  user: AuthUser,
  input: { name: string; prefix?: string }
) {
  const name = input.name.trim();
  const prefixRaw = (input.prefix ?? "").trim().toUpperCase();
  if (!name) throw new HttpError(400, "Workspace name is required");
  const prefix = (prefixRaw || name.slice(0, 3).toUpperCase()).replace(
    /[^A-Z0-9]/g,
    ""
  );

  const slug = await allocateUniqueSlug(name);

  const [ws] = await db
    .insert(workspaces)
    .values({ name, slug, prefix: prefix || "REL" })
    .returning();

  await db.insert(memberships).values({
    workspaceId: ws.id,
    userId: user.id,
    role: "owner",
  });

  await db
    .insert(statuses)
    .values(DEFAULT_STATUSES.map((s) => ({ ...s, workspaceId: ws.id })));

  return { slug: ws.slug };
}

export async function createInvite(ctx: WorkspaceContext) {
  const { workspace, user } = ctx;
  const [invite] = await db
    .insert(invites)
    .values({
      workspaceId: workspace.id,
      createdBy: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning();
  return { token: invite.token };
}

export async function acceptInvite(user: AuthUser, token: string) {
  const invite = await db.query.invites.findFirst({
    where: and(eq(invites.token, token), isNull(invites.usedAt)),
  });
  if (!invite || invite.expiresAt < new Date()) {
    throw new HttpError(400, "Invite is invalid or expired");
  }

  const existing = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, user.id),
      eq(memberships.workspaceId, invite.workspaceId)
    ),
  });

  if (!existing) {
    await db.insert(memberships).values({
      workspaceId: invite.workspaceId,
      userId: user.id,
      role: "member",
    });
    await db
      .update(invites)
      .set({ usedAt: new Date(), usedBy: user.id })
      .where(eq(invites.id, invite.id));
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, invite.workspaceId),
  });
  if (!workspace) throw new HttpError(404, "Workspace not found");

  return { slug: workspace.slug };
}

export async function getInvitePreview(token: string) {
  const invite = await db.query.invites.findFirst({
    where: and(eq(invites.token, token), isNull(invites.usedAt)),
    columns: { workspaceId: true, expiresAt: true },
  });
  if (!invite || invite.expiresAt <= new Date()) {
    return { valid: false, workspaceName: null as string | null };
  }
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, invite.workspaceId),
    columns: { name: true },
  });
  return {
    valid: Boolean(workspace),
    workspaceName: workspace?.name ?? null,
  };
}

/**
 * Remove a member, or let a non-owner leave.
 * Issues they were assigned stay in the workspace and become unassigned.
 */
export async function removeWorkspaceMember(
  ctx: WorkspaceContext,
  targetUserId: string
): Promise<{ left: boolean; remaining: WorkspaceListItem[] }> {
  const userId = targetUserId.trim();
  if (!userId) throw new HttpError(400, "Member is required");

  const { workspace, membership, user } = ctx;
  const target = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.workspaceId, workspace.id),
      eq(memberships.userId, userId)
    ),
    with: { user: true },
  });
  if (!target) throw new HttpError(404, "Member not found");

  const action = membershipRemoval({
    actorId: user.id,
    actorRole: membership.role,
    targetId: target.userId,
    targetRole: target.role,
  });

  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(memberships)
      .where(eq(memberships.id, target.id))
      .returning({ id: memberships.id });
    if (!deleted.length) throw new HttpError(404, "Member not found");

    const assigned = await tx
      .select({ id: issues.id })
      .from(issues)
      .where(
        and(eq(issues.workspaceId, workspace.id), eq(issues.assigneeId, userId))
      );

    if (assigned.length) {
      await tx
        .update(issues)
        .set({ assigneeId: null, updatedAt: new Date() })
        .where(
          and(
            eq(issues.workspaceId, workspace.id),
            eq(issues.assigneeId, userId)
          )
        );
      await tx.insert(activities).values(
        assigned.map((issue) => ({
          issueId: issue.id,
          actorId: user.id,
          type: "unassigned",
          data: { assigneeId: userId, name: target.user.name },
        }))
      );
    }

    await tx
      .delete(notifications)
      .where(
        and(
          eq(notifications.workspaceId, workspace.id),
          eq(notifications.userId, userId)
        )
      );

    await tx
      .delete(slackUserLinks)
      .where(
        and(
          eq(slackUserLinks.workspaceId, workspace.id),
          eq(slackUserLinks.userId, userId)
        )
      );
  });

  if (action === "leave") {
    return { left: true, remaining: await getUserWorkspaces(user.id) };
  }
  return { left: false, remaining: [] };
}

/**
 * Permanently delete the current workspace and all of its data.
 * Owner-only; `confirmName` must match the workspace name exactly.
 */
export async function deleteWorkspace(
  ctx: WorkspaceContext,
  confirmName: string
): Promise<{ remaining: WorkspaceListItem[] }> {
  const { workspace, membership, user } = ctx;

  if (membership.role !== "owner") {
    throw new HttpError(403, "Only the workspace owner can delete it");
  }
  if (confirmName.trim() !== workspace.name) {
    throw new HttpError(400, "Workspace name does not match");
  }

  const files = await db.query.attachments.findMany({
    where: eq(attachments.workspaceId, workspace.id),
    columns: { key: true },
  });

  await db.delete(workspaces).where(eq(workspaces.id, workspace.id));

  if (files.length) {
    await deleteObjects(files.map((f) => f.key));
  }

  const remaining = await getUserWorkspaces(user.id);
  return { remaining };
}
