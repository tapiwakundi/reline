import { requireWorkspace } from "@/lib/session";
import { getWorkspaceData } from "@/lib/queries";
import { UserAvatar } from "@/components/user-avatar";
import { InviteButton } from "@/components/settings/invite-button";

export default async function MembersPage() {
  const { workspace, user, membership } = await requireWorkspace();
  const data = await getWorkspaceData(
    { id: workspace.id, name: workspace.name, prefix: workspace.prefix },
    user.id
  );

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
        {data.members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <UserAvatar user={m} className="size-7" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {m.name}
                {m.id === user.id && (
                  <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">{m.email}</div>
            </div>
            <span className="text-xs capitalize text-muted-foreground">
              {m.id === user.id ? membership.role : "member"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
