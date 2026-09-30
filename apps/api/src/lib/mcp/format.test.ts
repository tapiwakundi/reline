import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatIssue, selectEmbedded } from "./format";
import type { McpIssue } from "./types";

const issue: McpIssue = {
  identifier: "REL-42",
  title: "Fix login redirect",
  description: "The next param is dropped.",
  url: "https://app.example.com/acme/issue/REL-42",
  workspaceName: "Acme",
  workspaceSlug: "acme",
  statusName: "In Progress",
  statusType: "started",
  priorityLabel: "High",
  typeLabel: "Bug",
  assignee: { name: "Ada Lovelace", email: "ada@example.com" },
  creator: { name: "Grace Hopper", email: "grace@example.com" },
  cycle: { number: 3, name: "Sprint 3", status: "active" },
  labels: ["auth"],
  estimate: 2,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
  attachments: [
    {
      id: "att-1",
      filename: "shot.png",
      contentType: "image/png",
      size: 1200,
      kind: "image",
      url: "https://files.example.com/shot.png",
    },
  ],
  comments: [
    {
      id: "c1",
      parentId: null,
      body: "Looks good",
      createdAt: "2026-09-01T12:00:00.000Z",
      author: { name: "Ada Lovelace", email: "ada@example.com" },
      attachments: [
        {
          id: "att-2",
          filename: "clip.mp4",
          contentType: "video/mp4",
          size: 50_000,
          kind: "video",
          url: "https://files.example.com/clip.mp4",
        },
      ],
    },
    {
      id: "c2",
      parentId: "c1",
      body: "Agreed",
      createdAt: "2026-09-01T13:00:00.000Z",
      author: null,
      attachments: [],
    },
  ],
};

describe("formatIssue", () => {
  it("includes the description, comments, and attachment ids", () => {
    const embedded = selectEmbedded(
      [...issue.attachments, ...issue.comments.flatMap((comment) => comment.attachments)],
      4 * 1024 * 1024,
      8
    );
    assert.equal(embedded.has("att-1"), true);
    assert.equal(embedded.has("att-2"), false);

    const text = formatIssue(issue, embedded);
    assert.match(text, /REL-42 · Fix login redirect/);
    assert.match(text, /The next param is dropped\./);
    assert.match(text, /Status: In Progress/);
    assert.match(text, /id=att-1/);
    assert.match(text, /image included below/);
    assert.match(text, /clip\.mp4/);
    assert.match(text, /video, open the URL/);
    assert.match(text, /Agreed/);
  });
});
