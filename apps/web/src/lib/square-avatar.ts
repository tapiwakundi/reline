const OUTPUT = 512;
/** Stay under Firefox's GPU texture limit so drawImage does not paint an empty canvas. */
const MAX_SOURCE_EDGE = 2048;

export function coverDrawRect(width: number, height: number, size: number) {
  if (width < 1 || height < 1) {
    throw new Error("Could not process that image");
  }
  const scale = Math.max(size / width, size / height);
  const w = width * scale;
  const h = height * scale;
  return { x: (size - w) / 2, y: (size - h) / 2, w, h };
}

/** True when the bitmap has any opaque pixel. A failed Firefox export is fully transparent. */
export function imageDataHasColor(data: Uint8ClampedArray, sampleEvery = 16) {
  const step = Math.max(1, sampleEvery) * 4;
  for (let i = 3; i < data.length; i += step) {
    if (data[i] > 8) return true;
  }
  return false;
}

async function decodeAvatarBitmap(file: File) {
  const full = await createImageBitmap(file, { imageOrientation: "from-image" });
  if (full.width < 1 || full.height < 1) {
    full.close();
    throw new Error("Could not process that image");
  }
  const longest = Math.max(full.width, full.height);
  if (longest <= MAX_SOURCE_EDGE) return full;

  const scale = MAX_SOURCE_EDGE / longest;
  try {
    return await createImageBitmap(full, {
      resizeWidth: Math.max(1, Math.round(full.width * scale)),
      resizeHeight: Math.max(1, Math.round(full.height * scale)),
      resizeQuality: "high",
    });
  } finally {
    full.close();
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, 0.9);
  });
}

async function blobHasColor(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(bitmap, 0, 0, 32, 32);
    return imageDataHasColor(ctx.getImageData(0, 0, 32, 32).data, 1);
  } finally {
    bitmap.close();
  }
}

export async function squareAvatar(file: File): Promise<File> {
  const bitmap = await decodeAvatarBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not process that image");

    const rect = coverDrawRect(bitmap.width, bitmap.height, OUTPUT);
    ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h);
    if (!imageDataHasColor(ctx.getImageData(0, 0, OUTPUT, OUTPUT).data)) {
      throw new Error("Could not process that image");
    }

    let blob = await canvasBlob(canvas, "image/webp");
    if (!blob || !(await blobHasColor(blob))) {
      blob = await canvasBlob(canvas, "image/jpeg");
    }
    if (!blob || !(await blobHasColor(blob))) {
      throw new Error("Could not process that image");
    }

    const ext = blob.type === "image/jpeg" ? "jpg" : "webp";
    return new File([blob], `avatar.${ext}`, { type: blob.type || "image/webp" });
  } finally {
    bitmap.close();
  }
}
