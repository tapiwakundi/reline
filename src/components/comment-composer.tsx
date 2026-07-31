"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import type { Member } from "@/lib/types";
import type { AttachmentInput } from "@/lib/actions/issues";
import { AttachButton } from "@/components/attachments/attach-button";
import { AttachmentThumbnails } from "@/components/attachments/attachment-thumbnails";
import { mediaFiles, useAttachmentUploads } from "@/lib/upload";

type MentionState = {
  query: string;
  start: number; // index of '@'
  end: number; // caret
};

function detectMention(value: string, caret: number): MentionState | null {
  // Look back from caret for an unclosed @mention token
  const before = value.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && /[\w.]/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  // Space or newline ends a mention (unless we're still typing the name)
  if (query.includes("\n")) return null;
  // Allow spaces in names while the picker is open, but cut off if there's
  // trailing punctuation that looks like the mention ended
  if (/[,.!?;:]/.test(query)) return null;
  return { query, start: at, end: caret };
}

export function CommentComposer({
  members,
  onSubmit,
  pending,
}: {
  members: Member[];
  onSubmit: (body: string, attachments: AttachmentInput[]) => void;
  pending?: boolean;
}) {
  const [value, setValue] = useState("");
  const [mention, setMention] = useState<MentionState | null>(null);
  const [active, setActive] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const uploads = useAttachmentUploads();

  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return members
      .filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [mention, members]);

  useEffect(() => {
    setActive(0);
  }, [mention?.query]);

  function updateFromTextarea() {
    const el = taRef.current;
    if (!el) return;
    setMention(detectMention(el.value, el.selectionStart));
  }

  function insertMention(member: Member) {
    const el = taRef.current;
    if (!el || !mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(mention.end);
    const insertion = `@${member.name} `;
    const next = before + insertion + after;
    const caret = before.length + insertion.length;
    setValue(next);
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  function submit() {
    const trimmed = value.trim();
    const attachments = uploads.toInput();
    if ((!trimmed && attachments.length === 0) || pending || uploads.uploading)
      return;
    onSubmit(trimmed, attachments);
    setValue("");
    setMention(null);
    uploads.clear();
  }

  return (
    <div
      className="relative mt-6 rounded-lg border border-border bg-card"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const files = mediaFiles(e.dataTransfer.files);
        if (files.length) {
          e.preventDefault();
          uploads.addFiles(files);
        }
      }}
    >
      {mention && matches.length > 0 && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Mention someone
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {matches.map((m, i) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-accent",
                    i === active && "bg-accent"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(m);
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  <UserAvatar user={m} className="size-5" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {m.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {m.email}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          requestAnimationFrame(updateFromTextarea);
        }}
        onClick={updateFromTextarea}
        onKeyUp={updateFromTextarea}
        onKeyDown={(e) => {
          if (mention && matches.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % matches.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + matches.length) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              insertMention(matches[active]!);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setMention(null);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        onPaste={(e) => {
          const files = mediaFiles(e.clipboardData.files);
          if (files.length) {
            e.preventDefault();
            uploads.addFiles(files);
          }
        }}
        placeholder="Leave a comment… Use @ to mention"
        rows={3}
        className="w-full resize-none bg-transparent p-3 text-[13px] outline-none placeholder:text-muted-foreground/50"
      />
      <AttachmentThumbnails
        pending={uploads.items}
        onRemovePending={uploads.remove}
        className="px-3 pb-2"
      />
      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
        <AttachButton onFiles={uploads.addFiles} disabled={pending} />
        <span className="mr-auto text-[11px] text-muted-foreground">
          @ to mention · ⌘↵ to send
        </span>
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
          Comment
        </Button>
      </div>
    </div>
  );
}
