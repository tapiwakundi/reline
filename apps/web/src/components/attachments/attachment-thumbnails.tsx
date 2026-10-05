"use client";

import { useState } from "react";
import { PlayIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PendingAttachment } from "@/lib/upload";
import {
  AttachmentLightbox,
  type LightboxMedia,
} from "@/components/attachments/attachment-lightbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type SavedAttachment = {
  id: string;
  url: string;
  filename: string;
  kind: "image" | "video";
};

function Tile({
  url,
  kind,
  filename,
  dimmed,
  progress,
  error,
  onOpen,
  onRemove,
  removeLabel = "Remove",
}: {
  url: string;
  kind: "image" | "video";
  filename: string;
  dimmed?: boolean;
  progress?: number;
  error?: string;
  onOpen?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <div
      className={cn(
        "group relative h-20 w-32 shrink-0 overflow-hidden rounded-md border border-border bg-muted/30",
        error && "border-destructive/60"
      )}
      title={error ?? filename}
    >
      <button
        type="button"
        className="block h-full w-full cursor-pointer"
        onClick={onOpen}
        disabled={!onOpen}
        aria-label={filename}
      >
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={filename}
            className={cn("h-full w-full object-cover", dimmed && "opacity-50")}
          />
        ) : (
          <>
            <video
              src={url}
              preload="metadata"
              muted
              playsInline
              className={cn("h-full w-full object-cover", dimmed && "opacity-50")}
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex size-7 items-center justify-center rounded-full bg-black/60">
                <PlayIcon className="size-3.5 fill-white text-white" />
              </span>
            </span>
          </>
        )}
      </button>

      {typeof progress === "number" && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-black/30">
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}

      {error && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-destructive/80 px-1.5 py-0.5 text-[10px] text-white">
          {error}
        </span>
      )}

      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white/80 opacity-0 transition-opacity hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`${removeLabel} ${filename}`}
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Wrapping row of compact media tiles — saved attachments (from the DB) and
 * in-flight uploads. Clicking a tile opens the lightbox.
 */
export function AttachmentThumbnails({
  saved = [],
  pending = [],
  onDeleteSaved,
  onRemovePending,
  className,
}: {
  saved?: SavedAttachment[];
  pending?: PendingAttachment[];
  onDeleteSaved?: (id: string) => void;
  onRemovePending?: (localId: string) => void;
  className?: string;
}) {
  const [lightbox, setLightbox] = useState<LightboxMedia | null>(null);
  const [confirming, setConfirming] = useState<SavedAttachment | null>(null);

  function confirmDelete() {
    if (!confirming || !onDeleteSaved) return;
    const id = confirming.id;
    setConfirming(null);
    onDeleteSaved(id);
  }

  if (saved.length === 0 && pending.length === 0 && !confirming) return null;

  return (
    <>
      <div className={cn("flex flex-wrap gap-2", className)}>
        {saved.map((a) => (
          <Tile
            key={a.id}
            url={a.url}
            kind={a.kind}
            filename={a.filename}
            onOpen={() =>
              setLightbox({ url: a.url, kind: a.kind, filename: a.filename })
            }
            onRemove={onDeleteSaved ? () => setConfirming(a) : undefined}
            removeLabel="Delete"
          />
        ))}
        {pending.map((p) => (
          <Tile
            key={p.localId}
            url={p.previewUrl}
            kind={p.contentType.startsWith("video/") ? "video" : "image"}
            filename={p.filename}
            dimmed={p.status === "uploading"}
            progress={p.status === "uploading" ? p.progress : undefined}
            error={p.status === "error" ? p.error : undefined}
            onOpen={
              p.status !== "error"
                ? () =>
                    setLightbox({
                      url: p.previewUrl,
                      kind: p.contentType.startsWith("video/")
                        ? "video"
                        : "image",
                      filename: p.filename,
                    })
                : undefined
            }
            onRemove={
              onRemovePending ? () => onRemovePending(p.localId) : undefined
            }
          />
        ))}
      </div>
      {lightbox && (
        <AttachmentLightbox media={lightbox} onClose={() => setLightbox(null)} />
      )}
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete attachment</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">
                {confirming?.filename ?? "This attachment"}
              </span>
              {" will be permanently deleted. You can't undo these changes."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirming(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
