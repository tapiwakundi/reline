"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  invites,
  memberships,
  statuses,
  workspaces,
} from "@/db/schema";
import { requireSession, requireWorkspace, getUserWorkspaces } from "@/lib/session";
import { DEFAULT_STATUSES } from "@/lib/defaults";
import { deleteObjects } from "@/lib/r2";
import {
  allocateUniqueSlug,
  WORKSPACE_SLUG_COOKIE,
  wsPath,
} from "@/lib/workspace-slug";

async function setWorkspaceCookie(slug: string) {
  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_SLUG_COOKIE, slug, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
}

export async function createWorkspace(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const prefixRaw = String(formData.get("prefix") ?? "").trim().toUpperCase();
  if (!name) throw new Error("Workspace name is required");
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
    userId: session.user.id,
    role: "owner",
  });

  await db
    .insert(statuses)
    .values(DEFAULT_STATUSES.map((s) => ({ ...s, workspaceId: ws.id })));

  await setWorkspaceCookie(ws.slug);
  redirect(wsPath(ws.slug, "/board"));
}

export async function createInvite() {
  const { workspace, user } = await requireWorkspace();
  const [invite] = await db
    .insert(invites)
    .values({
      workspaceId: workspace.id,
      createdBy: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning();
  revalidatePath(wsPath(workspace.slug, "/settings"));
  return { token: invite.token };
}

export async function acceptInvite(token: string) {
  const session = await requireSession();

  const invite = await db.query.invites.findFirst({
    where: and(eq(invites.token, token), isNull(invites.usedAt)),
  });
  if (!invite || invite.expiresAt < new Date()) {
    throw new Error("Invite is invalid or expired");
  }

  const existing = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, session.user.id),
      eq(memberships.workspaceId, invite.workspaceId)
    ),
  });

  if (!existing) {
    await db.insert(memberships).values({
      workspaceId: invite.workspaceId,
      userId: session.user.id,
      role: "member",
    });
    await db
      .update(invites)
      .set({ usedAt: new Date(), usedBy: session.user.id })
      .where(eq(invites.id, invite.id));
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, invite.workspaceId),
  });
  if (!workspace) redirect("/onboarding");

  await setWorkspaceCookie(workspace.slug);
  redirect(wsPath(workspace.slug, "/board"));
}

/**
 * Permanently delete the current workspace and all of its data.
 * Owner-only; `confirmName` must match the workspace name exactly.
 */
export async function deleteWorkspace(confirmName: string) {
  const { workspace, membership, user } = await requireWorkspace();

  if (membership.role !== "owner") {
    throw new Error("Only the workspace owner can delete it");
  }
  if (confirmName.trim() !== workspace.name) {
    throw new Error("Workspace name does not match");
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
  if (!remaining.length) {
    const cookieStore = await cookies();
    cookieStore.delete(WORKSPACE_SLUG_COOKIE);
    redirect("/onboarding");
  }

  await setWorkspaceCookie(remaining[0].slug);
  redirect(wsPath(remaining[0].slug, "/board"));
}
