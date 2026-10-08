"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { imageDataHasDetail } from "@/lib/square-avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const VIEW = 240;
const OUTPUT = 512;

function coverScale(width: number, height: number) {
  return Math.max(VIEW / width, VIEW / height);
}

function clampPan(
  x: number,
  y: number,
  width: number,
  height: number,
  zoom: number
) {
  const scale = coverScale(width, height) * zoom;
  const maxX = Math.max(0, (width * scale - VIEW) / 2);
  const maxY = Math.max(0, (height * scale - VIEW) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  };
}

function placement(
  width: number,
  height: number,
  zoom: number,
  pan: { x: number; y: number }
) {
  const scale = coverScale(width, height) * zoom;
  const dw = width * scale;
  const dh = height * scale;
  return {
    scale,
    width: dw,
    height: dh,
    left: (VIEW - dw) / 2 + pan.x,
    top: (VIEW - dh) / 2 + pan.y,
  };
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function exportSquare(
  image: HTMLImageElement,
  zoom: number,
  pan: { x: number; y: number },
  format: "webp" | "jpeg"
) {
  const { scale, left, top } = placement(
    image.naturalWidth,
    image.naturalHeight,
    zoom,
    pan
  );
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not crop that image");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    -left / scale,
    -top / scale,
    VIEW / scale,
    VIEW / scale,
    0,
    0,
    OUTPUT,
    OUTPUT
  );
  if (
    format === "jpeg" &&
    !imageDataHasDetail(ctx.getImageData(0, 0, OUTPUT, OUTPUT).data)
  ) {
    throw new Error("Could not crop that image");
  }

  const blob =
    format === "jpeg"
      ? await canvasBlob(canvas, "image/jpeg", 0.9)
      : (await canvasBlob(canvas, "image/webp", 0.92)) ??
        (await canvasBlob(canvas, "image/jpeg", 0.92));
  if (!blob) throw new Error("Could not crop that image");
  const ext = blob.type === "image/jpeg" ? "jpg" : "webp";
  const name = format === "jpeg" ? "avatar" : "logo";
  return new File([blob], `${name}.${ext}`, { type: blob.type || "image/webp" });
}

export function ImageCropDialog({
  file,
  onClose,
  onSave,
  title = "Crop logo",
  description = "Drag to reposition. Zoom so the mark fills the square.",
  saveLabel = "Save logo",
  failureMessage = "Could not save logo",
  shape = "rounded",
  format = "webp",
}: {
  file: File | null;
  onClose: () => void;
  onSave: (file: File) => Promise<void>;
  title?: string;
  description?: string;
  saveLabel?: string;
  failureMessage?: string;
  shape?: "rounded" | "circle";
  format?: "webp" | "jpeg";
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!file) {
      setImage(null);
      return;
    }
    let cancelled = false;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      if (!cancelled) setImage(el);
    };
    el.onerror = () => {
      if (cancelled) return;
      setImage(null);
      toast.error("Could not read that image");
      onCloseRef.current();
    };
    el.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || !image) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomNext = Math.min(
        3,
        Math.max(1, zoom + (e.deltaY < 0 ? 0.08 : -0.08))
      );
      setZoom(zoomNext);
      setPan((current) =>
        clampPan(
          current.x,
          current.y,
          image.naturalWidth,
          image.naturalHeight,
          zoomNext
        )
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [image, zoom]);

  function applyZoom(next: number) {
    const zoomNext = Math.min(3, Math.max(1, next));
    setZoom(zoomNext);
    if (!image) return;
    setPan((current) =>
      clampPan(
        current.x,
        current.y,
        image.naturalWidth,
        image.naturalHeight,
        zoomNext
      )
    );
  }

  async function save() {
    if (!image || saving) return;
    setSaving(true);
    try {
      await onSave(await exportSquare(image, zoom, pan, format));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : failureMessage);
    } finally {
      setSaving(false);
    }
  }

  const frame = image
    ? placement(image.naturalWidth, image.naturalHeight, zoom, pan)
    : null;

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            ref={frameRef}
            role="application"
            aria-label="Crop area"
            tabIndex={0}
            className={cn(
              "relative size-60 cursor-grab touch-none overflow-hidden bg-muted outline-none ring-1 ring-foreground/15 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
              shape === "circle" ? "rounded-full" : "rounded-lg"
            )}
            onPointerDown={(e) => {
              if (!image) return;
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                panX: pan.x,
                panY: pan.y,
              };
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                /* The pointer can already be gone in some browsers. */
              }
            }}
            onPointerMove={(e) => {
              if (!drag.current || !image) return;
              setPan(
                clampPan(
                  drag.current.panX + e.clientX - drag.current.x,
                  drag.current.panY + e.clientY - drag.current.y,
                  image.naturalWidth,
                  image.naturalHeight,
                  zoom
                )
              );
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onKeyDown={(e) => {
              if (!image) return;
              const step = e.shiftKey ? 24 : 8;
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                setPan((current) =>
                  clampPan(
                    current.x - step,
                    current.y,
                    image.naturalWidth,
                    image.naturalHeight,
                    zoom
                  )
                );
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                setPan((current) =>
                  clampPan(
                    current.x + step,
                    current.y,
                    image.naturalWidth,
                    image.naturalHeight,
                    zoom
                  )
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setPan((current) =>
                  clampPan(
                    current.x,
                    current.y - step,
                    image.naturalWidth,
                    image.naturalHeight,
                    zoom
                  )
                );
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setPan((current) =>
                  clampPan(
                    current.x,
                    current.y + step,
                    image.naturalWidth,
                    image.naturalHeight,
                    zoom
                  )
                );
              } else if (e.key === "+" || e.key === "=") {
                e.preventDefault();
                applyZoom(zoom + 0.1);
              } else if (e.key === "-" || e.key === "_") {
                e.preventDefault();
                applyZoom(zoom - 0.1);
              }
            }}
          >
            {frame && image ? (
              <img
                src={image.src}
                alt=""
                draggable={false}
                className="absolute max-w-none select-none"
                style={{
                  width: frame.width,
                  height: frame.height,
                  left: frame.left,
                  top: frame.top,
                }}
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                Loading…
              </span>
            )}
          </div>

          <label className="flex w-full flex-col gap-2">
            <span className="flex items-center justify-between text-xs text-muted-foreground">
              Zoom
              <span>{Math.round(zoom * 100)}%</span>
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              disabled={!image || saving}
              aria-label="Zoom"
              onChange={(e) => applyZoom(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:opacity-50"
            />
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!image || saving} onClick={save}>
            {saving ? "Saving…" : saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
