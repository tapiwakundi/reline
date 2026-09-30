"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspaceSettings } from "@/lib/hooks/queries";
import { useWorkspace } from "@/lib/workspace-context";
import { invalidateWorkspace } from "@/lib/invalidate";
import type { WorkspaceSettings } from "@/lib/types";
import { DeleteWorkspace } from "@/components/settings/delete-workspace";
import { LogoCropDialog } from "@/components/settings/logo-crop-dialog";
import { WorkspaceMark } from "@/components/workspace-mark";
import { Button } from "@/components/ui/button";
import { SettingsContentSkeleton } from "@/components/skeletons/page-skeletons";

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/avif,image/*";
const MAX_BYTES = 5 * 1024 * 1024;

export function SettingsGeneral({
  initialData,
}: {
  initialData: WorkspaceSettings;
}) {
  const { workspace: current } = useWorkspace();
  const { data, isPending } = useWorkspaceSettings(initialData);
  const router = useRouter();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  if (isPending && !data) return <SettingsContentSkeleton />;
  const { workspace, role } = data ?? initialData;
  const owner = role === "owner";

  function chooseFile(file: File | undefined) {
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Logo must be under 5 MB");
      return;
    }
    setCropFile(file);
  }

  async function saveLogo(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/workspace/logo", {
      method: "POST",
      headers: { "x-workspace-slug": current.slug },
      body: form,
    });
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!res.ok) throw new Error(body?.error ?? "Could not save logo");
    setCropFile(null);
    await invalidateWorkspace(qc, current.id);
    router.refresh();
    toast.success("Logo updated");
  }

  async function removeLogo() {
    if (removing) return;
    setRemoving(true);
    try {
      const res = await fetch("/api/workspace/logo", {
        method: "DELETE",
        headers: { "x-workspace-slug": current.slug },
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(body?.error ?? "Could not remove logo");
      await invalidateWorkspace(qc, current.id);
      router.refresh();
      toast.success("Logo removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove logo");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold">Workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Basic information about your workspace.
        </p>
      </div>
      <dl className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-sm text-muted-foreground">Logo</dt>
          <dd className="flex items-center gap-3">
            <WorkspaceMark
              name={workspace.name}
              logo={workspace.logo}
              className="size-10 rounded-md text-sm"
            />
            {owner ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={removing}
                  onClick={() => inputRef.current?.click()}
                >
                  {workspace.logo ? "Change" : "Upload"}
                </Button>
                {workspace.logo ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={removing}
                    onClick={removeLogo}
                  >
                    {removing ? "Removing…" : "Remove"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </dd>
        </div>
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
            {new Date(workspace.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </dd>
        </div>
      </dl>

      {role === "owner" && (
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

      <LogoCropDialog
        file={cropFile}
        onClose={() => {
          setCropFile(null);
          if (inputRef.current) inputRef.current.value = "";
        }}
        onSave={saveLogo}
      />
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          chooseFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
