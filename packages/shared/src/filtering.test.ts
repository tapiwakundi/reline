import assert from "node:assert/strict";
import test from "node:test";
import { applyFilters, EMPTY_FILTERS, type IssueFilters } from "./filtering";
import type { CycleRow, IssueListItem } from "./types";

const cycles: CycleRow[] = [
  {
    id: "sprint-1",
    number: 1,
    name: "Sprint 1",
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2026-01-14T00:00:00.000Z",
    status: "active",
  },
  {
    id: "sprint-2",
    number: 2,
    name: "Sprint 2",
    startDate: "2026-01-15T00:00:00.000Z",
    endDate: "2026-01-28T00:00:00.000Z",
    status: "planned",
  },
];

function issue(
  partial: Pick<IssueListItem, "id" | "statusId" | "cycleId"> &
    Partial<IssueListItem>
): IssueListItem {
  return {
    identifier: partial.id,
    number: 1,
    title: partial.id,
    type: "task",
    priority: 0,
    assigneeId: null,
    estimate: null,
    boardOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    labelIds: [],
    ...partial,
  };
}

const sprintFilter: IssueFilters = { ...EMPTY_FILTERS, cycleIds: ["sprint-2"] };

test("a cycle filter hides backlog issues that have no cycle", () => {
  const rows = [
    issue({ id: "in-sprint", statusId: "todo", cycleId: "sprint-2" }),
    issue({ id: "backlog", statusId: "backlog", cycleId: null }),
  ];
  const visible = applyFilters(rows, sprintFilter, cycles);
  assert.deepEqual(
    visible.map((i) => i.id),
    ["in-sprint"]
  );
});

test("a cycle board can show every uncycled backlog issue", () => {
  const rows = [
    issue({ id: "in-sprint", statusId: "todo", cycleId: "sprint-2" }),
    issue({ id: "backlog-a", statusId: "backlog", cycleId: null }),
    issue({ id: "backlog-b", statusId: "backlog", cycleId: null }),
    issue({ id: "other-sprint", statusId: "todo", cycleId: "sprint-1" }),
    issue({ id: "cycled-backlog", statusId: "backlog", cycleId: "sprint-1" }),
  ];
  const visible = applyFilters(rows, sprintFilter, cycles, {
    uncycledBacklogStatusIds: ["backlog"],
  });
  assert.deepEqual(
    visible.map((i) => i.id),
    ["in-sprint", "backlog-a", "backlog-b"]
  );
});

test("uncycled backlog still respects the other filters", () => {
  const rows = [
    issue({
      id: "mine",
      statusId: "backlog",
      cycleId: null,
      assigneeId: "ada",
    }),
    issue({
      id: "theirs",
      statusId: "backlog",
      cycleId: null,
      assigneeId: "grace",
    }),
  ];
  const visible = applyFilters(
    rows,
    { ...sprintFilter, assigneeIds: ["ada"] },
    cycles,
    { uncycledBacklogStatusIds: ["backlog"] }
  );
  assert.deepEqual(
    visible.map((i) => i.id),
    ["mine"]
  );
});

test("an explicit status filter still hides backlog", () => {
  const rows = [
    issue({ id: "in-sprint", statusId: "todo", cycleId: "sprint-2" }),
    issue({ id: "backlog", statusId: "backlog", cycleId: null }),
  ];
  const visible = applyFilters(
    rows,
    { ...sprintFilter, statusIds: ["todo"] },
    cycles,
    { uncycledBacklogStatusIds: ["backlog"] }
  );
  assert.deepEqual(
    visible.map((i) => i.id),
    ["in-sprint"]
  );
});
