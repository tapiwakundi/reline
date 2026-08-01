import { redirect } from "next/navigation";
import {
  requireSession,
  homeBoardPath,
  getUserWorkspaces,
} from "@/lib/session";
import { createWorkspace } from "@/lib/actions/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";

export default async function OnboardingPage() {
  const session = await requireSession();
  const existing = await getUserWorkspaces(session.user.id);
  if (existing.length) redirect(await homeBoardPath(session.user.id));

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
        <form action={createWorkspace} className="flex w-full flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Workspace name</Label>
            <Input id="name" name="name" placeholder="Acme Inc" required autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prefix">Issue prefix</Label>
            <Input
              id="prefix"
              name="prefix"
              placeholder="ACM"
              maxLength={5}
              className="uppercase"
            />
            <p className="text-xs text-muted-foreground">
              Used in issue IDs, e.g. ACM-42. Defaults to the first 3 letters.
            </p>
          </div>
          <Button type="submit" className="w-full">
            Create workspace
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          Joining a teammate? Ask them for an invite link instead.
        </p>
      </div>
    </div>
  );
}
