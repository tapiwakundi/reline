"use client";

import { useRef } from "react";
import { PaperclipIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mediaFiles } from "@/lib/upload";

export function AttachButton({
  onFiles,
  disabled,
  className,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = mediaFiles(e.target.files);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        className={className ?? "size-7 text-muted-foreground hover:text-foreground"}
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title="Attach image or video"
      >
        <PaperclipIcon className="size-4" />
      </Button>
    </>
  );
}
