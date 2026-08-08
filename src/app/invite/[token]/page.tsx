import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invites, workspaces } from "@/db/schema";
import { getSession } from "@/lib/session";
import { acceptInvite } from "@/lib/actions/workspace";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const invite = await db.query.invites.findFirst({
    where: and(eq(invites.token, token), isNull(invites.usedAt)),
    columns: { workspaceId: true, expiresAt: true },
  });
  if (!invite || invite.expiresAt <= new Date()) {
    return { title: "Invite" };
  }
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, invite.workspaceId),
    columns: { name: true },
  });
  return {
    title: workspace ? `Join ${workspace.name}` : "Invite",
  };
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getSession();
  if (!session) redirect(`/signup?invite=${token}`);

  const invite = await db.query.invites.findFirst({
    where: and(eq(invites.token, token), isNull(invites.usedAt)),
  });
  const workspace = invite
    ? await db.query.workspaces.findFirst({
        where: eq(workspaces.id, invite.workspaceId),
      })
    : null;
  const valid = invite && workspace && invite.expiresAt > new Date();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-6 text-center">
        <Logo className="size-12 rounded-xl" />
        {valid ? (
          <>
            <div>
              <h1 className="text-lg font-medium">
                Join {workspace.name} on Reline
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                You&apos;ve been invited to collaborate in this workspace.
              </p>
            </div>
            <form
              action={async () => {
                "use server";
                await acceptInvite(token);
              }}
            >
              <Button type="submit">Accept invite</Button>
            </form>
          </>
        ) : (
          <div>
            <h1 className="text-lg font-medium">Invite not valid</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This invite link has expired or was already used. Ask your
              teammate for a new one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
