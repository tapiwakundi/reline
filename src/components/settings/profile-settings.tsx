"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CameraIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { useWorkspace } from "@/lib/workspace-context";
import { invalidateAfterProfileChange } from "@/lib/invalidate";

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/avif,image/*";
const MAX_BYTES = 5 * 1024 * 1024;

async function squareAvatar(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not process that image");
  }
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (webp) => {
        if (webp) resolve(webp);
        else canvas.toBlob(resolve, "image/jpeg", 0.9);
      },
      "image/webp",
      0.9
    );
  });
  if (!blob) throw new Error("Could not process that image");
  const ext = blob.type === "image/jpeg" ? "jpg" : "webp";
  return new File([blob], `avatar.${ext}`, { type: blob.type || "image/webp" });
}

export function ProfileSettings() {
  const { me, workspace } = useWorkspace();
  const router = useRouter();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const shown = preview ? { ...me, image: preview } : me;

  async function applyImage() {
    await invalidateAfterProfileChange(qc, workspace.id);
    router.refresh();
  }

  async function onFile(file: File | undefined) {
    if (!file || busy) return;
    if (file.type && !file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Photo must be under 5 MB");
      return;
    }

    setBusy("upload");
    const local = URL.createObjectURL(file);
    setPreview(local);
    try {
      let upload = file;
      if (file.type !== "image/gif") {
        try {
          upload = await squareAvatar(file);
        } catch {
          if (!file.type.startsWith("image/") || file.size > MAX_BYTES) {
            throw new Error("Could not process that image");
          }
        }
      }

      const form = new FormData();
      form.append("file", upload);
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
      await applyImage();
      toast.success("Profile photo updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload photo");
    } finally {
      setPreview(null);
      URL.revokeObjectURL(local);
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (busy || !me.image) return;
    setBusy("remove");
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
      setBusy(null);
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
          disabled={busy !== null}
          title="Upload photo"
        >
          <UserAvatar
            user={shown}
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
              disabled={busy !== null}
              onClick={() => inputRef.current?.click()}
            >
              {busy === "upload" ? "Uploading…" : "Upload photo"}
            </Button>
            {me.image ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={remove}
              >
                {busy === "remove" ? "Removing…" : "Remove"}
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            JPEG, PNG, GIF, WebP, or AVIF. Max 5 MB.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </div>
  );
}
