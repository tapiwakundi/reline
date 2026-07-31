"use client";

import { useCallback, useRef, useState } from "react";
import type { AttachmentInput } from "@/lib/actions/issues";

export type AttachmentKind = "image" | "video";

export type PendingAttachment = {
  localId: string;
  filename: string;
  contentType: string;
  size: number;
  /** Object URL for the local preview */
  previewUrl: string;
  progress: number; // 0..1
  status: "uploading" | "done" | "error";
  error?: string;
  key?: string;
  url?: string;
  kind?: AttachmentKind;
};

export function isSupportedMedia(file: File) {
  return file.type.startsWith("image/") || file.type.startsWith("video/");
}

export function mediaFiles(list: FileList | File[] | null | undefined) {
  if (!list) return [];
  return Array.from(list).filter(isSupportedMedia);
}

/** Same-origin upload to our API (avoids R2 CORS). */
function uploadWithProgress(
  file: File,
  onProgress: (fraction: number) => void
) {
  return new Promise<{
    key: string;
    publicUrl: string;
    kind: AttachmentKind;
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/attachments/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: {
        error?: string;
        key?: string;
        publicUrl?: string;
        kind?: AttachmentKind;
      } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.key && data.publicUrl && data.kind) {
        resolve({
          key: data.key,
          publicUrl: data.publicUrl,
          kind: data.kind,
        });
      } else {
        reject(new Error(data?.error ?? `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

/**
 * Manages uploads via the Next.js API → R2 (no browser CORS to R2).
 * Used by the create dialog, comment composer, and issue detail.
 */
export function useAttachmentUploads() {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const counter = useRef(0);

  const patch = useCallback(
    (localId: string, update: Partial<PendingAttachment>) => {
      setItems((prev) =>
        prev.map((it) => (it.localId === localId ? { ...it, ...update } : it))
      );
    },
    []
  );

  const addFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const localId = `upload-${++counter.current}-${Date.now()}`;
        setItems((prev) => [
          ...prev,
          {
            localId,
            filename: file.name,
            contentType: file.type,
            size: file.size,
            previewUrl: URL.createObjectURL(file),
            progress: 0,
            status: "uploading",
          },
        ]);

        (async () => {
          // #region agent log
          fetch("http://127.0.0.1:7359/ingest/c6e924e4-96dd-46bf-962f-91fc58f5ca8b", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Debug-Session-Id": "846e9b",
            },
            body: JSON.stringify({
              sessionId: "846e9b",
              runId: "post-fix",
              hypothesisId: "A",
              location: "upload.ts:proxy-start",
              message: "proxy upload start",
              data: {
                localId,
                filename: file.name,
                contentType: file.type,
                size: file.size,
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          const { key, publicUrl, kind } = await uploadWithProgress(
            file,
            (fraction) => patch(localId, { progress: fraction })
          );
          // #region agent log
          fetch("http://127.0.0.1:7359/ingest/c6e924e4-96dd-46bf-962f-91fc58f5ca8b", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Debug-Session-Id": "846e9b",
            },
            body: JSON.stringify({
              sessionId: "846e9b",
              runId: "post-fix",
              hypothesisId: "A",
              location: "upload.ts:proxy-done",
              message: "proxy upload done",
              data: { localId, key, kind },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          patch(localId, {
            status: "done",
            progress: 1,
            key,
            url: publicUrl,
            kind,
          });
        })().catch((e: unknown) => {
          // #region agent log
          fetch("http://127.0.0.1:7359/ingest/c6e924e4-96dd-46bf-962f-91fc58f5ca8b", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Debug-Session-Id": "846e9b",
            },
            body: JSON.stringify({
              sessionId: "846e9b",
              runId: "post-fix",
              hypothesisId: "A",
              location: "upload.ts:error",
              message: "upload failed",
              data: {
                localId,
                error: e instanceof Error ? e.message : String(e),
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          patch(localId, {
            status: "error",
            error: e instanceof Error ? e.message : "Upload failed",
          });
        });
      }
    },
    [patch]
  );

  const remove = useCallback((localId: string) => {
    setItems((prev) => {
      const item = prev.find((it) => it.localId === localId);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((it) => it.localId !== localId);
    });
  }, []);

  const clear = useCallback(() => {
    setItems((prev) => {
      prev.forEach((it) => URL.revokeObjectURL(it.previewUrl));
      return [];
    });
  }, []);

  const uploading = items.some((it) => it.status === "uploading");

  /** Completed uploads in the shape the server actions expect. */
  const toInput = useCallback((): AttachmentInput[] => {
    return items
      .filter((it) => it.status === "done" && it.key)
      .map((it) => ({
        key: it.key!,
        filename: it.filename,
        contentType: it.contentType,
        size: it.size,
      }));
  }, [items]);

  return { items, addFiles, remove, clear, uploading, toInput };
}
