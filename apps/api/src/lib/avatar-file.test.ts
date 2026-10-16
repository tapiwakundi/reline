import assert from "node:assert/strict";
import test from "node:test";
import { isBlankCanvasWebp } from "./avatar-file";

test("a failed Firefox canvas export is rejected", () => {
  assert.equal(isBlankCanvasWebp("image/webp", 582), true);
});

test("a normal photo is kept", () => {
  assert.equal(isBlankCanvasWebp("image/jpeg", 92775), false);
  assert.equal(isBlankCanvasWebp("image/webp", 92906), false);
});
