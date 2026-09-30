import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { OnboardingForm } from "@/components/onboarding-form";
import { Logo } from "@/components/logo";
import { serverApi } from "@/lib/server-api";
import type { MeResponse } from "@/lib/types";

export const metadata: Metadata = { title: "Create workspace" };

export default async function OnboardingPage() {
  const me = await serverApi<MeResponse>("/api/me");
  if (me.workspaces.length) redirect(me.homePath);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-6">
        <Logo className="size-12 rounded-xl" />
        <div className="text-center">
          <h1 className="text-lg font-medium">Create your workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Workspaces hold your team&apos;s issues, cycles, and labels.
          </p>
        </div>
        <OnboardingForm />
        <p className="text-center text-xs text-muted-foreground">
          Joining a teammate? Ask them for an invite link instead.
        </p>
      </div>
    </div>
  );
}
