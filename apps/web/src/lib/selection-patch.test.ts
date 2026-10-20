import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { patchForSelectedIssue } from "./selection-patch";

describe("patchForSelectedIssue", () => {
  const source = { id: "a", labelIds: ["bug"] };
  const other = { id: "b", labelIds: ["design"] };

  it("copies a status or assignee onto every selected ticket", () => {
    assert.deepEqual(patchForSelectedIssue(source, other, { statusId: "todo" }), {
      statusId: "todo",
    });
    assert.deepEqual(
      patchForSelectedIssue(source, other, { assigneeId: "ada" }),
      { assigneeId: "ada" }
    );
    assert.deepEqual(patchForSelectedIssue(source, other, { assigneeId: null }), {
      assigneeId: null,
    });
  });

  it("adds and removes only the labels changed on the edited ticket", () => {
    assert.deepEqual(
      patchForSelectedIssue(source, other, { labelIds: ["bug", "urgent"] }),
      { labelIds: ["design", "urgent"] }
    );
    assert.deepEqual(patchForSelectedIssue(source, other, { labelIds: [] }), {
      labelIds: ["design"],
    });
  });

  it("does not attach an epic to itself", () => {
    const epic = { id: "epic", labelIds: [] };
    assert.equal(patchForSelectedIssue(epic, epic, { epicId: "epic" }), null);
    assert.deepEqual(patchForSelectedIssue(epic, other, { epicId: "epic" }), {
      epicId: "epic",
    });
  });
});
