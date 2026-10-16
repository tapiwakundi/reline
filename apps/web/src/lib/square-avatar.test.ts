import assert from "node:assert/strict";
import test from "node:test";
import { imageDataHasDetail } from "./square-avatar";

test("a flat canvas is not a photo", () => {
  const flat = new Uint8ClampedArray(64 * 4);
  for (let i = 0; i < flat.length; i += 4) {
    flat[i] = 0;
    flat[i + 1] = 0;
    flat[i + 2] = 0;
    flat[i + 3] = 255;
  }
  assert.equal(imageDataHasDetail(flat, 1), false);
});

test("a portrait has enough tonal variation to keep", () => {
  const data = new Uint8ClampedArray(32 * 4);
  for (let i = 0; i < data.length; i += 4) {
    const n = i / 4;
    data[i] = n * 8;
    data[i + 1] = 40 + n;
    data[i + 2] = 80;
    data[i + 3] = 255;
  }
  assert.equal(imageDataHasDetail(data, 1), true);
});
