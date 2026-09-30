import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { AcceptInviteButton } from "@/components/accept-invite-button";
import { serverApi } from "@/lib/server-api";
import type { InvitePreview, Member } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const invite = await serverApi<InvitePreview>(
    `/api/invites/${encodeURIComponent(token)}`,
    { optionalAuth: true }
  );
  return {
    title:
      invite.valid && invite.workspaceName
        ? `Join ${invite.workspaceName}`
        : "Invite",
  };
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await serverApi<{ user: Member | null }>("/api/session", {
    optionalAuth: true,
  });
  if (!session.user) redirect(`/signup?invite=${token}`);

  const invite = await serverApi<InvitePreview>(
    `/api/invites/${encodeURIComponent(token)}`
  );
  const valid = invite.valid && invite.workspaceName;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-6 text-center">
        <Logo className="size-12 rounded-xl" />
        {valid ? (
          <>
            <div>
              <h1 className="text-lg font-medium">
                Join {invite.workspaceName} on Reline
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                You&apos;ve been invited to collaborate in this workspace.
              </p>
            </div>
            <AcceptInviteButton token={token} />
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
