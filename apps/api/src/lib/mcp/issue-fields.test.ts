import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchAssignee,
  matchByName,
  matchCycle,
  matchLabels,
  parseIssueWriteArgs,
  parsePriority,
  resolveEpicSelection,
} from "./issue-fields";

describe("issue write fields", () => {
  it("requires a title to create and a change to update", () => {
    const created = parseIssueWriteArgs({ description: "## Hi\n- one" }, "create");
    assert.equal(created.ok, false);

    const updated = parseIssueWriteArgs({ identifier: "REL-42" }, "update");
    assert.equal(updated.ok, false);

    const write = parseIssueWriteArgs(
      {
        workspace: "acme",
        title: "  Ship login  ",
        description: "* check redirect\n* check cookie",
        priority: "High",
        type: "Bug",
        assignee: "me",
        labels: ["Auth", ""],
        cycle: "none",
      },
      "create"
    );
    assert.equal(write.ok, true);
    if (!write.ok) return;
    assert.equal(write.value.title, "Ship login");
    assert.equal(write.value.description, "- check redirect\n- check cookie");
    assert.equal(write.value.priority, 2);
    assert.equal(write.value.type, "bug");
    assert.deepEqual(write.value.assignee, { kind: "me" });
    assert.deepEqual(write.value.labels, ["Auth"]);
    assert.deepEqual(write.value.cycle, { kind: "clear" });
    assert.equal(write.value.workspace, "acme");
  });

  it("accepts epics and tickets attached to them", () => {
    const created = parseIssueWriteArgs(
      {
        title: "Billing",
        type: "Epic",
        issues: ["REL-3", "https://app.example.com/acme/issue/REL-4"],
      },
      "create"
    );
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.value.type, "epic");
    assert.deepEqual(created.value.issues, [
      { identifier: "REL-3" },
      { identifier: "REL-4", slug: "acme" },
    ]);

    const linked = parseIssueWriteArgs(
      { identifier: "REL-9", epic: "none" },
      "update"
    );
    assert.equal(linked.ok, true);
    if (!linked.ok) return;
    assert.deepEqual(linked.value.epic, { kind: "clear" });

    assert.equal(
      parseIssueWriteArgs({ title: "Nested", type: "epic", epic: "REL-1" }, "create").ok,
      false
    );
    assert.equal(
      parseIssueWriteArgs({ title: "Story", type: "story", issues: ["REL-3"] }, "create").ok,
      false
    );
    assert.equal(parseIssueWriteArgs({ identifier: "REL-1", issues: [] }, "update").ok, false);
    assert.equal(parseIssueWriteArgs({ identifier: "REL-1", issues: ["nope"] }, "update").ok, false);

    const epics = [
      { id: "e1", identifier: "REL-1", title: "Billing", type: "epic" as const },
      { id: "s1", identifier: "REL-3", title: "Fix tax", type: "story" as const },
    ];
    const workspace = { slug: "acme", prefix: "REL" };
    assert.deepEqual(resolveEpicSelection(epics, { kind: "query", query: "billing" }, workspace), {
      ok: true,
      value: "e1",
    });
    assert.deepEqual(resolveEpicSelection(epics, { kind: "query", query: "REL-3" }, workspace), {
      ok: false,
      error: "REL-3 is a Story, not an epic.",
    });
    assert.deepEqual(resolveEpicSelection(epics, { kind: "clear" }, workspace), {
      ok: true,
      value: null,
    });
    assert.equal(
      resolveEpicSelection(epics, { kind: "query", query: "Missing" }, workspace).ok,
      false
    );
  });

  it("parses priority labels and numbers", () => {
    assert.deepEqual(parsePriority("urgent"), { ok: true, value: 1 });
    assert.deepEqual(parsePriority(4), { ok: true, value: 4 });
    assert.equal(parsePriority("critical").ok, false);
  });

  it("matches workspace names, members, labels, and cycles", () => {
    const statuses = [
      { id: "s1", name: "In Progress" },
      { id: "s2", name: "Todo" },
    ];
    assert.equal(matchByName(statuses, "in progress", "status").ok, true);

    const members = [
      { id: "u1", name: "Ada Lovelace", email: "ada@example.com" },
      { id: "u2", name: "Grace Hopper", email: "grace@example.com" },
    ];
    assert.deepEqual(matchAssignee(members, { kind: "me" }, "u2"), { ok: true, value: "u2" });
    assert.deepEqual(matchAssignee(members, { kind: "query", query: "ADA@example.com" }, "u2"), {
      ok: true,
      value: "u1",
    });
    assert.deepEqual(matchAssignee(members, { kind: "clear" }, "u2"), { ok: true, value: null });

    const labels = matchLabels(
      [
        { id: "l1", name: "Auth" },
        { id: "l2", name: "Bug" },
      ],
      ["bug", "Auth", "bug"]
    );
    assert.deepEqual(labels, { ok: true, value: ["l2", "l1"] });

    const cycles = [
      { id: "c1", name: "Sprint 3", number: 3 },
      { id: "c2", name: "Sprint 4", number: 4 },
    ];
    assert.deepEqual(matchCycle(cycles, { kind: "query", query: "4" }), { ok: true, value: "c2" });
    assert.deepEqual(matchCycle(cycles, { kind: "query", query: "sprint 3" }), {
      ok: true,
      value: "c1",
    });
    assert.equal(matchCycle(cycles, { kind: "query", query: "Sprint 9" }).ok, false);
  });
});

describe("assignee and cycle shortcuts", () => {
  const members = [
    { id: "t", name: "Tapiwa Kundishora", email: "tkundishora@example.com" },
    { id: "s", name: "Sam Lee", email: "sam@example.com" },
    { id: "s2", name: "Sam Ortiz", email: "ortiz@example.com" },
    { id: "l", name: "Lee", email: "lee@example.com" },
  ];
  const query = (value: string) => ({ kind: "query" as const, query: value });

  it("matches a first name, surname, or email name when only one member fits", () => {
    assert.deepEqual(matchAssignee(members, query("tapiwa"), "t"), { ok: true, value: "t" });
    assert.deepEqual(matchAssignee(members, query("Kundishora"), "t"), { ok: true, value: "t" });
    assert.deepEqual(matchAssignee(members, query("tkundishora"), "t"), { ok: true, value: "t" });
    assert.deepEqual(matchAssignee(members, query("ortiz"), "t"), { ok: true, value: "s2" });
  });

  it("lists the candidates when a name is ambiguous and never guesses", () => {
    const result = matchAssignee(members, query("sam"), "t");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /Sam Lee \(sam@example.com\), Sam Ortiz \(ortiz@example.com\)/);
  });

  it("prefers an exact name over a partial one", () => {
    assert.deepEqual(matchAssignee(members, query("Lee"), "t"), { ok: true, value: "l" });
  });

  it("does not match a fragment of a name", () => {
    assert.equal(matchAssignee(members, query("Taps"), "t").ok, false);
    assert.equal(matchAssignee(members, query("Tap"), "t").ok, false);
  });

  it("resolves active to the current cycle", () => {
    const cycles = [{ id: "c1", name: "Sprint 1", number: 1 }];
    assert.deepEqual(matchCycle(cycles, query("active"), "c1"), { ok: true, value: "c1" });
    assert.deepEqual(matchCycle(cycles, query("Current"), "c1"), { ok: true, value: "c1" });
    assert.equal(matchCycle(cycles, query("active"), null).ok, false);
  });

  it("lets a cycle actually named Active win over the keyword", () => {
    const cycles = [
      { id: "c1", name: "Sprint 1", number: 1 },
      { id: "c2", name: "Active", number: 2 },
    ];
    assert.deepEqual(matchCycle(cycles, query("active"), "c1"), { ok: true, value: "c2" });
  });

  it("names every missing label at once", () => {
    const result = matchLabels([{ id: "1", name: "Auth" }], ["Nope", "Auth", "Also"]);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /"Nope", "Also"/);
  });
});
