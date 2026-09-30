"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { useWorkspaceSettings } from "@/lib/hooks/queries";
import type { WorkspaceSettings } from "@/lib/types";
import { UserAvatar } from "@/components/user-avatar";
import { InviteButton } from "@/components/settings/invite-button";
import { SettingsContentSkeleton } from "@/components/skeletons/page-skeletons";

export function SettingsMembers({
  initialData,
}: {
  initialData: WorkspaceSettings;
}) {
  const { me } = useWorkspace();
  const { data, isPending } = useWorkspaceSettings(initialData);
  if (isPending && !data) return <SettingsContentSkeleton />;
  const settings = data ?? initialData;

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
        {settings.members.map((m) => (
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
              {m.id === me.id ? settings.role : "member"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
