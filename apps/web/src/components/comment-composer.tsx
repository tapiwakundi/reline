"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BlockEditor } from "@/components/block-editor";
import type { Member } from "@/lib/types";
import type { AttachmentInput } from "@/lib/api/issues";
import { AttachButton } from "@/components/attachments/attach-button";
import { AttachmentThumbnails } from "@/components/attachments/attachment-thumbnails";
import { mediaFiles, useAttachmentUploads } from "@/lib/upload";
import { cn } from "@/lib/utils";

export function CommentComposer({
  members,
  onSubmit,
  pending,
  placeholder = "Leave a comment… Type / to format, @ to mention",
  submitLabel = "Comment",
  autoFocus,
  onCancel,
  className,
}: {
  members: Member[];
  onSubmit: (body: string, attachments: AttachmentInput[]) => void;
  pending?: boolean;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  /** When set, shows a Cancel button (used for inline reply composers). */
  onCancel?: () => void;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const uploads = useAttachmentUploads();

  function submit() {
    const trimmed = value.trim();
    const attachments = uploads.toInput();
    if ((!trimmed && attachments.length === 0) || pending || uploads.uploading)
      return;
    onSubmit(trimmed, attachments);
    setValue("");
    uploads.clear();
  }

  return (
    <div
      className={cn("relative mt-6 rounded-lg border border-border bg-card", className)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const files = mediaFiles(e.dataTransfer.files);
        if (files.length) {
          e.preventDefault();
          uploads.addFiles(files);
        }
      }}
    >
      <BlockEditor
        value={value}
        onChange={setValue}
        members={members}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onSubmit={submit}
        onCancel={onCancel}
        onPasteFiles={(files) => {
          const media = mediaFiles(files);
          if (!media.length) return false;
          uploads.addFiles(media);
          return true;
        }}
        menuPlacement="top"
        density="comment"
        className={onCancel ? "min-h-12 px-3 pt-2" : "min-h-16 px-3 pt-3"}
      />
      <AttachmentThumbnails
        pending={uploads.items}
        onRemovePending={uploads.remove}
        className="px-3 pb-2"
      />
      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
        <AttachButton onFiles={uploads.addFiles} disabled={pending} />
        <span className="mr-auto text-[11px] text-muted-foreground">
          / to format · @ to mention · ⌘↵ to send
        </span>
        {onCancel && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={submit}
          disabled={
            pending ||
            uploads.uploading ||
            (!value.trim() && uploads.toInput().length === 0)
          }
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
