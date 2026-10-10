import assert from "node:assert/strict";
import test from "node:test";
import {
  cycleNameLabel,
  defaultCycleName,
  normalizeCycleName,
} from "./cycle-name";

test("cycle names fall back to the workspace name", () => {
  const workspace = { name: "Siimply", cycleName: null };
  assert.equal(cycleNameLabel(workspace), "Siimply");
  assert.equal(defaultCycleName(workspace, 3), "Siimply Cycle 3");
});

test("a custom cycle name replaces the workspace name", () => {
  const workspace = { name: "Siimply", cycleName: "Sprint" };
  assert.equal(defaultCycleName(workspace, 4), "Sprint Cycle 4");
});

test("blank or matching the workspace name clears the custom label", () => {
  assert.equal(normalizeCycleName("  ", "Siimply"), null);
  assert.equal(normalizeCycleName("Siimply", "Siimply"), null);
  assert.equal(normalizeCycleName(" Sprint ", "Siimply"), "Sprint");
});
