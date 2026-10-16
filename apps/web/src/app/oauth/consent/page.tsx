import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { serverApi } from "@/lib/server-api";
import type { Member } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Authorize Cursor" };
export const dynamic = "force-dynamic";

type ConsentInfo = {
  clientName: string;
  redirectUri: string;
  redirectHost: string;
  loopback: boolean;
  scope: "read" | "write";
};

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string; error?: string }>;
}) {
  const params = await searchParams;
  if (params.error) {
    return (
      <ConsentMessage
        title="Couldn’t connect"
        body="This authorization request isn’t valid. Go back to Cursor and try again."
      />
    );
  }

  const request = params.request?.trim();
  if (!request) {
    return (
      <ConsentMessage
        title="This request expired"
        body="Go back to Cursor and connect again."
      />
    );
  }

  const session = await serverApi<{ user: Member | null }>("/api/session", {
    optionalAuth: true,
  });
  if (!session.user) {
    const next = `/oauth/consent?request=${encodeURIComponent(request)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  let info: ConsentInfo;
  try {
    info = await serverApi<ConsentInfo>(
      `/api/oauth/consent?request=${encodeURIComponent(request)}`
    );
  } catch {
    return (
      <ConsentMessage
        title="This request expired"
        body="Go back to Cursor and connect again."
      />
    );
  }

  const canWrite = info.scope === "write";

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <Logo className="size-12 rounded-xl" />
      <div>
        <h1 className="text-lg font-medium">
          {info.clientName} wants to access Reline
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {canWrite
            ? "It can read, create, and edit issues in workspaces you belong to. It cannot delete issues."
            : "It can read issues in workspaces you belong to. It cannot create or edit them."}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          After you authorize, you&apos;ll return to{" "}
          <span className="font-mono text-xs text-foreground">
            {info.redirectHost}
          </span>
          .
        </p>
        {info.loopback ? (
          <p className="mt-2 text-sm text-muted-foreground">
            That address is on this computer. The code goes back to the app
            that opened this page.
          </p>
        ) : null}
      </div>
      <form
        action="/api/oauth/authorize"
        method="post"
        className="flex w-full flex-col gap-2"
      >
        <input type="hidden" name="request" value={request} />
        <button
          type="submit"
          name="decision"
          value="allow"
          className={cn(buttonVariants(), "w-full")}
        >
          Authorize
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          Cancel
        </button>
      </form>
    </div>
  );
}

function ConsentMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <Logo className="size-12 rounded-xl" />
      <div>
        <h1 className="text-lg font-medium">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
