"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CameraIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageCropDialog } from "@/components/settings/image-crop-dialog";
import { UserAvatar } from "@/components/user-avatar";
import { useWorkspace } from "@/lib/workspace-context";
import { invalidateAfterProfileChange } from "@/lib/invalidate";

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/avif,image/*";
const MAX_BYTES = 5 * 1024 * 1024;

export function ProfileSettings() {
  const { me, workspace } = useWorkspace();
  const router = useRouter();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function applyImage() {
    await invalidateAfterProfileChange(qc, workspace.id);
    router.refresh();
  }

  function chooseFile(file: File | undefined) {
    if (!file || busy) return;
    if (file.type && !file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Photo must be under 5 MB");
      return;
    }
    setCropFile(file);
  }

  async function savePhoto(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/profile/avatar", {
      method: "POST",
      body: form,
    });
    const data = (await res.json().catch(() => null)) as {
      image?: string;
      error?: string;
    } | null;
    if (!res.ok || !data?.image) {
      throw new Error(data?.error ?? "Could not upload photo");
    }
    setCropFile(null);
    await applyImage();
    toast.success("Profile photo updated");
  }

  async function remove() {
    if (busy || cropFile || !me.image) return;
    setBusy(true);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not remove photo");
      await applyImage();
      toast.success("Profile photo removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove photo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold">Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your photo is shown on issues, comments, and the sidebar.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center">
        <button
          type="button"
          className="group relative size-16 shrink-0 rounded-full"
          onClick={() => inputRef.current?.click()}
          disabled={busy || cropFile !== null}
          title="Upload photo"
        >
          <UserAvatar
            user={me}
            className="size-16"
            fallbackClassName="text-lg"
          />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <CameraIcon className="size-5" />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{me.name}</div>
          <div className="truncate text-xs text-muted-foreground">{me.email}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || cropFile !== null}
              onClick={() => inputRef.current?.click()}
            >
              Upload photo
            </Button>
            {me.image ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy || cropFile !== null}
                onClick={remove}
              >
                {busy ? "Removing…" : "Remove"}
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            JPEG, PNG, GIF, WebP, or AVIF. Max 5 MB.
          </p>
        </div>
      </div>

      <ImageCropDialog
        file={cropFile}
        title="Crop photo"
        description="Drag to reposition. Zoom so your face fills the circle."
        saveLabel="Save photo"
        failureMessage="Could not save photo"
        shape="circle"
        format="jpeg"
        onClose={() => {
          setCropFile(null);
          if (inputRef.current) inputRef.current.value = "";
        }}
        onSave={savePhoto}
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
