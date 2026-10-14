import assert from "node:assert/strict";
import test from "node:test";
import type { StatusRow } from "@reline/shared";
import { mapJiraStatus } from "./mapping";

const statuses: StatusRow[] = [
  { id: "late", name: "QA", type: "started", color: "#f2c94c", position: 4 },
  { id: "early", name: "Doing", type: "started", color: "#f2c94c", position: 2 },
  { id: "backlog", name: "Backlog", type: "backlog", color: "#95a2b3", position: 0 },
];

test("jira status maps to the leftmost column of that category", () => {
  assert.equal(mapJiraStatus("In Progress", statuses).id, "early");
});

test("an exact column name wins over the category", () => {
  assert.equal(mapJiraStatus("QA", statuses).id, "late");
});
