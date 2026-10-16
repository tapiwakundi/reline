import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_STATUSES } from "./defaults";
import {
  defaultStatusColor,
  isStatusColor,
  isStatusType,
  nextStatusPosition,
  normalizeStatusName,
  parseStatusName,
  statusOrderUpdate,
} from "./statuses";

test("built-in columns are the default board", () => {
  assert.deepEqual(
    DEFAULT_STATUSES.map((status) => [status.name, status.type, status.position]),
    [
      ["Backlog", "backlog", 0],
      ["Todo", "unstarted", 1],
      ["In Progress", "started", 2],
      ["Done", "done", 3],
      ["Canceled", "canceled", 4],
    ]
  );
});

test("column names collapse whitespace and reject duplicates", () => {
  assert.equal(normalizeStatusName("  In   review "), "In review");
  const existing = [{ id: "todo", name: "Todo" }];
  assert.deepEqual(parseStatusName("  ", existing), {
    ok: false,
    error: "Column name is required",
  });
  assert.equal(parseStatusName("  In review  ", existing).ok, true);
  assert.deepEqual(parseStatusName("todo", existing), {
    ok: false,
    error: "A column with that name already exists",
  });
  assert.equal(parseStatusName("TODO", existing, "todo").ok, true);
  assert.equal(parseStatusName("x".repeat(41), existing).ok, false);
});

test("column colors and categories are validated", () => {
  assert.equal(isStatusColor("#5e6ad2"), true);
  assert.equal(isStatusColor("5e6ad2"), false);
  assert.equal(isStatusColor("#fff"), false);
  assert.equal(isStatusType("started"), true);
  assert.equal(isStatusType("review"), false);
  assert.equal(defaultStatusColor("started"), "#f2c94c");
});

test("new columns append after the last position", () => {
  assert.equal(nextStatusPosition([]), 0);
  assert.equal(nextStatusPosition([{ position: 0 }, { position: 4 }]), 5);
});

test("column order must be a permutation and is stored left to right", () => {
  const current = ["backlog", "todo", "doing"];
  assert.deepEqual(statusOrderUpdate(current, ["doing", "backlog", "todo"]), {
    ok: true,
    positions: [
      { id: "doing", position: 0 },
      { id: "backlog", position: 1 },
      { id: "todo", position: 2 },
    ],
  });
  assert.equal(statusOrderUpdate(current, ["doing", "backlog"]).ok, false);
  assert.equal(statusOrderUpdate(current, ["doing", "backlog", "doing"]).ok, false);
  assert.equal(
    statusOrderUpdate(current, ["doing", "backlog", "other"]).ok,
    false
  );
});
