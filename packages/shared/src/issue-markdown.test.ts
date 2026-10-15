import assert from "node:assert/strict";
import test from "node:test";
import {
  isPlainDocument,
  normalizeIssueMarkdown,
  parseBlocks,
  parseInline,
  serializeBlocks,
} from "./issue-markdown";

test("normalizes editor markdown for stored descriptions", () => {
  const markdown = [
    "# Title",
    "## Section",
    "### Detail",
    "",
    "Intro with **bold** and *italic*",
    "* one",
    "* two",
    "3. first",
    "9. second",
    "- [ ] open",
    "- [X] done",
    "> quoted",
    "---",
    "```ts",
    "const a = 1",
    "```",
    "",
  ].join("\n");

  const stored = normalizeIssueMarkdown(markdown);
  assert.equal(
    stored,
    [
      "# Title",
      "## Section",
      "### Detail",
      "",
      "Intro with **bold** and *italic*",
      "- one",
      "- two",
      "1. first",
      "2. second",
      "- [ ] open",
      "- [x] done",
      "> quoted",
      "---",
      "```ts",
      "const a = 1",
      "```",
    ].join("\n")
  );
  assert.equal(serializeBlocks(parseBlocks(stored)), stored);
  assert.equal(isPlainDocument(stored), false);
  assert.equal(parseInline("**bold**")[0]?.type, "bold");
});

test("blank descriptions stay empty", () => {
  assert.equal(normalizeIssueMarkdown(""), "");
  assert.equal(normalizeIssueMarkdown(" \n\t"), "");
  assert.equal(normalizeIssueMarkdown("line\r\nnext"), "line\nnext");
});
