import assert from "node:assert/strict";
import test from "node:test";
import { epicLinksToApply, epicProgress, nextEpicId } from "./epics";

test("an epic is never linked under another epic", () => {
  assert.equal(nextEpicId({ nextType: "epic", requested: "epic-1" }), null);
  assert.equal(nextEpicId({ nextType: "epic", requested: undefined }), null);
});

test("other types keep the requested epic link", () => {
  assert.equal(nextEpicId({ nextType: "story", requested: "epic-1" }), "epic-1");
  assert.equal(nextEpicId({ nextType: "story", requested: null }), null);
  assert.equal(nextEpicId({ nextType: "bug", requested: undefined }), undefined);
});

test("epic progress counts only done statuses", () => {
  const statuses = [
    { id: "done", type: "done" as const },
    { id: "canceled", type: "canceled" as const },
    { id: "todo", type: "unstarted" as const },
  ];
  assert.deepEqual(
    epicProgress(
      [{ statusId: "done" }, { statusId: "canceled" }, { statusId: "todo" }],
      statuses
    ),
    { total: 3, done: 1 }
  );
});

test("imported issues link only when the parent key is an epic", () => {
  const links = epicLinksToApply([
    { id: "e", type: "epic", jiraKey: "REL-1" },
    { id: "s", type: "story", jiraKey: "REL-2", parentKey: "REL-1" },
    { id: "t", type: "task", jiraKey: "REL-3", parentKey: "rel-2" },
    { id: "b", type: "bug", jiraKey: "REL-4", parentKey: "MISSING" },
    { id: "nested", type: "epic", jiraKey: "REL-5", parentKey: "REL-1" },
  ]);
  assert.deepEqual(links, [{ id: "s", epicId: "e" }]);
});
