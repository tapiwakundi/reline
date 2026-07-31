"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invites, memberships, statuses, workspaces } from "@/db/schema";
import { requireSession, requireWorkspace } from "@/lib/session";
import { DEFAULT_STATUSES } from "@/lib/defaults";

export async function createWorkspace(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const prefixRaw = String(formData.get("prefix") ?? "").trim().toUpperCase();
  if (!name) throw new Error("Workspace name is required");
  const prefix = (prefixRaw || name.slice(0, 3).toUpperCase()).replace(
    /[^A-Z0-9]/g,
    ""
  );

  const existing = await db.query.memberships.findFirst({
    where: eq(memberships.userId, session.user.id),
  });
  if (existing) redirect("/board");

  const [ws] = await db
    .insert(workspaces)
    .values({ name, prefix: prefix || "REL" })
    .returning();

  await db.insert(memberships).values({
    workspaceId: ws.id,
    userId: session.user.id,
    role: "owner",
  });

  await db
    .insert(statuses)
    .values(DEFAULT_STATUSES.map((s) => ({ ...s, workspaceId: ws.id })));

  redirect("/board");
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
  revalidatePath("/settings");
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

  redirect("/board");
}
