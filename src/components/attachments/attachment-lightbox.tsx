"use client";

import { useEffect } from "react";
import { XIcon } from "lucide-react";

export type LightboxMedia = {
  url: string;
  kind: "image" | "video";
  filename: string;
};

export function AttachmentLightbox({
  media,
  onClose,
}: {
  media: LightboxMedia;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
      onClick={onClose}
      role="dialog"
      aria-label={media.filename}
    >
      <button
        type="button"
        className="absolute right-4 top-4 rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        onClick={onClose}
        aria-label="Close"
      >
        <XIcon className="size-5" />
      </button>
      {media.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.url}
          alt={media.filename}
          className="max-h-full max-w-full rounded-md object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <video
          src={media.url}
          controls
          autoPlay
          className="max-h-full max-w-full rounded-md"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}
