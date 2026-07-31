import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { memberships, workspaces } from "@/db/schema";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const requireSession = cache(async () => {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
});

/**
 * The signed-in user's workspace context. MVP assumes one workspace per user
 * (first membership wins). Redirects to onboarding if the user has none.
 */
export const requireWorkspace = cache(async () => {
  const session = await requireSession();
  const membership = await db.query.memberships.findFirst({
    where: eq(memberships.userId, session.user.id),
  });
  if (!membership) redirect("/onboarding");
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, membership.workspaceId),
  });
  if (!workspace) redirect("/onboarding");
  return { session, user: session.user, membership, workspace };
});
