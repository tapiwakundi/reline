import assert from "node:assert/strict";
import test from "node:test";
import {
  cycleIdAfterStatusChange,
  earliestStatusId,
  todoStatusIdForCycleEntry,
} from "./issue-cycle";

const statuses = [
  { id: "backlog", type: "backlog" },
  { id: "todo", type: "unstarted" },
  { id: "doing", type: "started" },
  { id: "done", type: "done" },
];

test("leaving backlog for todo joins the target sprint", () => {
  assert.equal(
    cycleIdAfterStatusChange(statuses, "backlog", "todo", null, "sprint-2"),
    "sprint-2"
  );
});

test("leaving backlog for another status joins only when asked", () => {
  assert.equal(
    cycleIdAfterStatusChange(statuses, "backlog", "doing", null, "sprint-2"),
    undefined
  );
  assert.equal(
    cycleIdAfterStatusChange(
      statuses,
      "backlog",
      "doing",
      null,
      "sprint-2",
      true
    ),
    "sprint-2"
  );
});

test("moving into backlog clears the cycle", () => {
  assert.equal(
    cycleIdAfterStatusChange(statuses, "todo", "backlog", "sprint-2", "sprint-2"),
    null
  );
  assert.equal(
    cycleIdAfterStatusChange(statuses, "doing", "backlog", "sprint-2", "sprint-2", true),
    null
  );
});

test("a move that stays out of backlog keeps the existing cycle", () => {
  assert.equal(
    cycleIdAfterStatusChange(statuses, "todo", "doing", "sprint-2", "sprint-9", true),
    undefined
  );
});

test("cycle entry uses the leftmost unstarted column", () => {
  const columns = [
    { id: "backlog", type: "backlog", position: 0 },
    { id: "review", type: "unstarted", position: 3 },
    { id: "todo", type: "unstarted", position: 1 },
  ];
  assert.equal(earliestStatusId(columns, "unstarted"), "todo");
  assert.equal(
    todoStatusIdForCycleEntry(columns, "backlog", "sprint-2"),
    "todo"
  );
  assert.equal(todoStatusIdForCycleEntry(columns, "backlog", null), undefined);
  assert.equal(todoStatusIdForCycleEntry(columns, "todo", "sprint-2"), undefined);
});

test("an issue that already has a cycle is not reassigned from backlog", () => {
  assert.equal(
    cycleIdAfterStatusChange(
      statuses,
      "backlog",
      "todo",
      "sprint-1",
      "sprint-2",
      true
    ),
    undefined
  );
});
