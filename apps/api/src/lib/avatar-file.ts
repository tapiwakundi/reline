/**
 * Firefox on Windows can export a failed canvas draw as a few-hundred-byte
 * transparent WebP. A real photo is much larger.
 */
export function isBlankCanvasWebp(contentType: string, byteLength: number) {
  return contentType === "image/webp" && byteLength < 2048;
}
