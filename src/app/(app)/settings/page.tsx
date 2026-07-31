import { requireWorkspace } from "@/lib/session";
import { DeleteWorkspace } from "@/components/settings/delete-workspace";

export default async function SettingsGeneralPage() {
  const { workspace, membership } = await requireWorkspace();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold">Workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Basic information about your workspace.
        </p>
      </div>
      <dl className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <dt className="text-sm text-muted-foreground">Name</dt>
          <dd className="text-sm font-medium">{workspace.name}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-sm text-muted-foreground">Issue prefix</dt>
          <dd className="rounded border border-border px-1.5 py-0.5 font-mono text-xs">
            {workspace.prefix}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-sm text-muted-foreground">Created</dt>
          <dd className="text-sm">
            {workspace.createdAt.toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </dd>
        </div>
      </dl>

      {membership.role === "owner" && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold">Danger zone</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Irreversible actions for this workspace.
            </p>
          </div>
          <DeleteWorkspace workspaceName={workspace.name} />
        </div>
      )}
    </div>
  );
}
