"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace-context";
import { useWorkspaceSettings } from "@/lib/hooks/queries";
import { removeWorkspaceMember } from "@/lib/api/workspace";
import { invalidateIssues, invalidateWorkspace } from "@/lib/invalidate";
import { queryKeys } from "@/lib/query-keys";
import { wsPath } from "@/lib/workspace-paths";
import type { WorkspaceMember, WorkspaceSettings } from "@/lib/types";
import { UserAvatar } from "@/components/user-avatar";
import { InviteButton } from "@/components/settings/invite-button";
import { SettingsContentSkeleton } from "@/components/skeletons/page-skeletons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SettingsMembers({
  initialData,
}: {
  initialData: WorkspaceSettings;
}) {
  const { me, workspace } = useWorkspace();
  const { data, isPending } = useWorkspaceSettings(initialData);
  const router = useRouter();
  const qc = useQueryClient();
  const [target, setTarget] = useState<WorkspaceMember | null>(null);
  const [pending, setPending] = useState(false);

  if (isPending && !data) return <SettingsContentSkeleton />;
  const settings = data ?? initialData;
  const owner = settings.role === "owner";

  function onOpenChange(open: boolean) {
    if (pending) return;
    if (!open) setTarget(null);
  }

  async function confirm() {
    if (!target || pending) return;
    const leaving = target.id === me.id;
    setPending(true);
    try {
      const { slug } = await removeWorkspaceMember(target.id);
      if (leaving) {
        toast.success(`You left ${settings.workspace.name}`);
        router.push(slug ? wsPath(slug, "/board") : "/onboarding");
        router.refresh();
        return;
      }
      qc.setQueryData<WorkspaceSettings>(
        queryKeys.workspace.settings(workspace.id),
        (current) =>
          current
            ? {
                ...current,
                members: current.members.filter((member) => member.id !== target.id),
              }
            : current
      );
      await Promise.all([
        invalidateWorkspace(qc, workspace.id),
        invalidateIssues(qc, workspace.id),
      ]);
      router.refresh();
      toast.success(`Removed ${target.name}`);
      setTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove member");
    } finally {
      setPending(false);
    }
  }

  const leaving = target?.id === me.id;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold">Members</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            People with access to this workspace.
          </p>
        </div>
        <InviteButton />
      </div>
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {settings.members.map((m) => {
          const canRemove = owner && m.role !== "owner";
          const canLeave = m.id === me.id && settings.role !== "owner";
          return (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <UserAvatar user={m} className="size-7" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {m.name}
                  {m.id === me.id && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      (you)
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {m.email}
                </div>
              </div>
              <span className="text-xs capitalize text-muted-foreground">
                {m.role}
              </span>
              {(canRemove || canLeave) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setTarget(m)}
                >
                  {canLeave ? "Leave" : "Remove"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={target !== null} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>
              {leaving ? "Leave workspace" : "Remove member"}
            </DialogTitle>
            <DialogDescription>
              {leaving ? (
                <>
                  You will lose access to{" "}
                  <span className="font-medium text-foreground">
                    {settings.workspace.name}
                  </span>
                  . Issues assigned to you will be unassigned.
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">
                    {target?.name}
                  </span>{" "}
                  will lose access to{" "}
                  <span className="font-medium text-foreground">
                    {settings.workspace.name}
                  </span>
                  . Issues assigned to them will be unassigned.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={confirm}
            >
              {pending
                ? leaving
                  ? "Leaving…"
                  : "Removing…"
                : leaving
                  ? "Leave"
                  : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
