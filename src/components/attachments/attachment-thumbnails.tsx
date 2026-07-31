"use client";

import { useState } from "react";
import { PlayIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PendingAttachment } from "@/lib/upload";
import {
  AttachmentLightbox,
  type LightboxMedia,
} from "@/components/attachments/attachment-lightbox";

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
}: {
  url: string;
  kind: "image" | "video";
  filename: string;
  dimmed?: boolean;
  progress?: number;
  error?: string;
  onOpen?: () => void;
  onRemove?: () => void;
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
          onClick={onRemove}
          className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white/80 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
          aria-label={`Remove ${filename}`}
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

  if (saved.length === 0 && pending.length === 0) return null;

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
            onRemove={onDeleteSaved ? () => onDeleteSaved(a.id) : undefined}
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
    </>
  );
}
