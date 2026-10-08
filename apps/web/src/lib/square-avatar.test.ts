import assert from "node:assert/strict";
import test from "node:test";
import { coverDrawRect, imageDataHasColor } from "./square-avatar";

test("cover crop centers a wide photo in the square", () => {
  const rect = coverDrawRect(1000, 500, 512);
  assert.equal(rect.w, 1024);
  assert.equal(rect.h, 512);
  assert.equal(rect.x, -256);
  assert.equal(rect.y, 0);
});

test("a fully transparent export is rejected", () => {
  const blank = new Uint8ClampedArray(64);
  assert.equal(imageDataHasColor(blank, 1), false);
});

test("an opaque pixel counts as a real photo", () => {
  const data = new Uint8ClampedArray(16);
  data[4] = 20;
  data[5] = 30;
  data[6] = 40;
  data[7] = 255;
  assert.equal(imageDataHasColor(data, 1), true);
});
