import assert from "node:assert/strict";
import test from "node:test";
import {
  adjacentBlockId,
  blockIdsBetween,
  blockIsWrapped,
  blocksContentEqual,
  detectMention,
  detectSlash,
  edgeBlockId,
  filterSlashCommands,
  isPlainDocument,
  parseBlocks,
  parseInline,
  rangeIsWrapped,
  reduceEditor,
  serializeBlocks,
  toggleTodo,
  valueMatchesEditor,
  wrapRange,
  type Block,
} from "./editor-document";

function roundTrip(markdown: string) {
  return serializeBlocks(parseBlocks(markdown));
}

function textOf(blocks: Block[]) {
  return blocks.map((block) => `${block.type}:${block.checked ? "x" : ""}:${block.text}`);
}

test("plain text round-trips and stays a plain document", () => {
  const markdown = "Hello world\nThis is a second line\n\nAfter a gap";
  assert.equal(roundTrip(markdown), markdown);
  assert.equal(serializeBlocks(parseBlocks(roundTrip(markdown))), roundTrip(markdown));
  assert.equal(isPlainDocument(markdown), true);
  assert.equal(isPlainDocument(""), true);
});

test("block markdown round-trips", () => {
  const markdown = [
    "# Title",
    "## Section",
    "### Detail",
    "",
    "Intro with words",
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
  ].join("\n");
  assert.equal(roundTrip(markdown), markdown);
  assert.equal(isPlainDocument(markdown), false);
});

test("does not treat #hashtag, >=, or mid-line dashes as blocks", () => {
  const markdown = "#hashtag\n2 >= 1\nstill - a dash";
  const blocks = parseBlocks(markdown);
  assert.deepEqual(
    blocks.map((block) => block.type),
    ["paragraph", "paragraph", "paragraph"]
  );
  assert.equal(serializeBlocks(blocks), markdown);
});

test("renumbers ordered lists and preserves todo state", () => {
  const blocks = parseBlocks("3. a\n9. b\n\n- [X] Ship it");
  assert.equal(serializeBlocks(blocks), "1. a\n2. b\n\n- [x] Ship it");
  assert.equal(blocks[3]!.checked, true);
});

test("toggleTodo flips only the requested checkbox", () => {
  const markdown = "- [ ] a\n- [x] b\n- [ ] c";
  assert.equal(toggleTodo(markdown, 1), "- [ ] a\n- [ ] b\n- [ ] c");
  assert.equal(toggleTodo(markdown, 0), "- [x] a\n- [x] b\n- [ ] c");
  assert.equal(toggleTodo(markdown, 9), markdown);
});

test("inline marks leave ordinary punctuation alone", () => {
  assert.deepEqual(parseInline("5 * 3 = 15"), [{ type: "text", value: "5 * 3 = 15" }]);
  assert.deepEqual(parseInline("snake_case_more"), [
    { type: "text", value: "snake_case_more" },
  ]);
  assert.deepEqual(parseInline("no__double"), [{ type: "text", value: "no__double" }]);

  const italic = parseInline("say *hello* now");
  assert.equal(italic[1]?.type, "italic");
  assert.deepEqual(parseInline("**bold**"), [
    { type: "bold", children: [{ type: "text", value: "bold" }] },
  ]);
  assert.equal(parseInline("~~gone~~")[0]?.type, "strike");
  assert.deepEqual(parseInline("use `a * b` here")[1], { type: "code", value: "a * b" });
  const link = parseInline("see [docs](https://example.com/docs).");
  assert.equal(link[1]?.type, "link");
  assert.equal(isPlainDocument("just words and 5 * 3"), true);
  assert.equal(isPlainDocument("has *italic*"), false);
});

test("slash query matches headings, lists, and italic", () => {
  assert.deepEqual(
    filterSlashCommands("heading").map((command) => command.id),
    ["h1", "h2", "h3"]
  );
  assert.deepEqual(
    filterSlashCommands("heading 1").map((command) => command.id),
    ["h1"]
  );
  assert.deepEqual(
    filterSlashCommands("check").map((command) => command.id),
    ["todo"]
  );
  assert.equal(filterSlashCommands("italic")[0]?.id, "italic");
  assert.equal(filterSlashCommands("nope").length, 0);
  assert.equal(filterSlashCommands("").length > 10, true);
});

test("slash and mention detection follow the caret", () => {
  assert.deepEqual(detectSlash("hello /hea", 10), { query: "hea", start: 6, end: 10 });
  assert.equal(detectSlash("https://example.com", 8), null);
  assert.equal(detectSlash("and/or", 6), null);
  assert.deepEqual(detectSlash("/bold", 5), { query: "bold", start: 0, end: 5 });
  assert.deepEqual(detectMention("hi @Ada", 7), { query: "Ada", start: 3, end: 7 });
  assert.equal(detectMention("a@b.com", 7), null);
});

test("typing at the start of a long block does not move the caret", () => {
  const blocks = parseBlocks(
    "This is a large block of text that wraps and should keep the caret where the user placed it."
  );
  const id = blocks[0]!.id;
  const typed = "X" + blocks[0]!.text;
  const result = reduceEditor(blocks, {
    type: "text",
    blockId: id,
    text: typed,
    caret: 1,
  });
  assert.equal(result.selection, undefined);
  assert.equal(result.blocks[0]!.text, typed);
  assert.equal(result.blocks[0]!.id, id);
  assert.equal(valueMatchesEditor(result.blocks, serializeBlocks(result.blocks)), true);
});

test("parent echo and normalized fences do not rebuild the document", () => {
  const blocks = parseBlocks("```\nconst a = 1");
  assert.equal(valueMatchesEditor(blocks, "```\nconst a = 1"), true);
  assert.equal(valueMatchesEditor(blocks, "```\nconst a = 1\n```"), true);
  const edited = reduceEditor(blocks, {
    type: "text",
    blockId: blocks[0]!.id,
    text: "const a = 1\nconst b = 2",
    caret: 11,
  });
  assert.equal(edited.selection, undefined);
  assert.equal(
    valueMatchesEditor(edited.blocks, "completely different"),
    false
  );
});

test("markdown shortcuts and slash commands change the block", () => {
  let blocks = parseBlocks("");
  let result = reduceEditor(blocks, {
    type: "text",
    blockId: blocks[0]!.id,
    text: "# ",
    caret: 2,
  });
  assert.equal(result.blocks[0]!.type, "h1");
  assert.equal(result.blocks[0]!.text, "");
  assert.equal(result.selection?.start, 0);

  blocks = parseBlocks("Hello");
  result = reduceEditor(blocks, {
    type: "text",
    blockId: blocks[0]!.id,
    text: "# Hello",
    caret: 7,
  });
  assert.equal(result.blocks[0]!.type, "h1");
  assert.equal(result.blocks[0]!.text, "Hello");

  blocks = parseBlocks("Keep this");
  result = reduceEditor(blocks, {
    type: "slash",
    blockId: blocks[0]!.id,
    commandId: "todo",
    start: 0,
    end: 5,
  });
  assert.equal(result.blocks[0]!.type, "todo");
  assert.equal(result.blocks[0]!.text, "this");

  blocks = parseBlocks("");
  result = reduceEditor(blocks, {
    type: "slash",
    blockId: blocks[0]!.id,
    commandId: "italic",
    start: 0,
    end: 7,
  });
  assert.equal(result.blocks[0]!.text, "*text*");
  assert.deepEqual(
    { start: result.selection?.start, end: result.selection?.end },
    { start: 1, end: 5 }
  );

  blocks = parseBlocks("Item");
  result = reduceEditor(blocks, {
    type: "slash",
    blockId: blocks[0]!.id,
    commandId: "divider",
    start: 4,
    end: 5,
  });
  assert.deepEqual(textOf(result.blocks), ["paragraph::Item", "divider::", "paragraph::"]);
  assert.equal(result.selection?.id, result.blocks[2]!.id);
});

test("enter, backspace, and wrap behave like a block editor", () => {
  let blocks = parseBlocks("alpha beta");
  let result = reduceEditor(blocks, {
    type: "enter",
    blockId: blocks[0]!.id,
    caret: 6,
  });
  assert.deepEqual(textOf(result.blocks), ["paragraph::alpha ", "paragraph::beta"]);
  assert.equal(result.selection?.start, 0);

  blocks = parseBlocks("- item");
  result = reduceEditor(blocks, { type: "enter", blockId: blocks[0]!.id, caret: 4 });
  assert.deepEqual(
    result.blocks.map((block) => block.type),
    ["bullet", "bullet"]
  );

  blocks = result.blocks;
  const empty = blocks[1]!;
  result = reduceEditor(blocks, { type: "enter", blockId: empty.id, caret: 0 });
  assert.equal(result.blocks[1]!.type, "paragraph");

  blocks = parseBlocks("# Title");
  result = reduceEditor(blocks, { type: "backspace", blockId: blocks[0]!.id });
  assert.equal(result.blocks[0]!.type, "paragraph");
  assert.equal(result.blocks[0]!.text, "Title");

  blocks = parseBlocks("Hello\nworld");
  result = reduceEditor(blocks, { type: "backspace", blockId: blocks[1]!.id });
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0]!.text, "Helloworld");
  assert.equal(result.selection?.start, 5);

  blocks = parseBlocks("Hello");
  result = reduceEditor(blocks, { type: "backspace", blockId: blocks[0]!.id });
  assert.equal(result.handled, false);

  assert.deepEqual(wrapRange("hello", 0, 5, "**"), {
    text: "**hello**",
    start: 2,
    end: 7,
  });
  assert.deepEqual(wrapRange("**hello**", 2, 7, "**"), {
    text: "hello",
    start: 0,
    end: 5,
  });
});

test("multiline paste splits blocks and a code block stays one block", () => {
  const blocks = parseBlocks("");
  const pasted = reduceEditor(blocks, {
    type: "paste",
    blockId: blocks[0]!.id,
    caret: 0,
    text: "# Title\n\n- item",
  });
  assert.deepEqual(textOf(pasted.blocks), ["h1::Title", "paragraph::", "bullet::item"]);

  const code = parseBlocks("```\nalready\n```");
  const intoCode = reduceEditor(code, {
    type: "paste",
    blockId: code[0]!.id,
    caret: 7,
    text: "\nmore",
  });
  assert.equal(intoCode.blocks.length, 1);
  assert.equal(intoCode.blocks[0]!.type, "code");
  assert.equal(intoCode.blocks[0]!.text, "already\nmore");
  assert.equal(reduceEditor(blocks, {
    type: "paste",
    blockId: blocks[0]!.id,
    caret: 0,
    text: "single line",
  }).handled, false);
});

test("set-type converts one block or a run of them", () => {
  const blocks = parseBlocks("Hello\nWorld\n- item\n> quoted");
  const ids = [blocks[0]!.id, blocks[1]!.id];
  const result = reduceEditor(blocks, {
    type: "set-type",
    blockIds: ids,
    blockType: "h2",
  });
  assert.deepEqual(
    result.blocks.map((block) => block.type),
    ["h2", "h2", "bullet", "quote"]
  );
  assert.equal(result.blocks[0]!.text, "Hello");
  assert.equal(result.blocks[0]!.id, blocks[0]!.id);
  assert.equal(result.selection, undefined);

  const one = reduceEditor(result.blocks, {
    type: "set-type",
    blockIds: [result.blocks[2]!.id],
    blockType: "todo",
  });
  assert.equal(one.blocks[2]!.type, "todo");
  assert.equal(one.blocks[2]!.text, "item");
  assert.equal(one.blocks[2]!.checked, false);

  const same = reduceEditor(one.blocks, {
    type: "set-type",
    blockIds: [one.blocks[2]!.id],
    blockType: "todo",
  });
  assert.equal(same.blocks[2], one.blocks[2]);
  assert.equal(
    reduceEditor(blocks, { type: "set-type", blockIds: ["missing"], blockType: "h1" })
      .handled,
    false
  );
});

test("wrap-many toggles each selected section", () => {
  const blocks = parseBlocks("one\ntwo\n---\nthree");
  const ids = blocks.map((block) => block.id);
  const bold = reduceEditor(blocks, { type: "wrap-many", blockIds: ids, marker: "**" });
  assert.deepEqual(textOf(bold.blocks), [
    "paragraph::**one**",
    "paragraph::**two**",
    "divider::",
    "paragraph::**three**",
  ]);
  const plain = reduceEditor(bold.blocks, {
    type: "wrap-many",
    blockIds: ids,
    marker: "**",
  });
  assert.deepEqual(textOf(plain.blocks), [
    "paragraph::one",
    "paragraph::two",
    "divider::",
    "paragraph::three",
  ]);
  assert.equal(blockIsWrapped("**one**", "**"), true);
  assert.equal(blockIsWrapped("**one**", "*"), false);
  assert.equal(rangeIsWrapped("say **hi** now", 6, 8, "**"), true);
  assert.equal(rangeIsWrapped("say **hi** now", 4, 10, "*"), false);
});

test("block id span follows document order", () => {
  const blocks = parseBlocks("a\nb\nc\nd");
  const ids = blocks.map((block) => block.id);
  assert.deepEqual(blockIdsBetween(blocks, ids[2]!, ids[0]!), [ids[0], ids[1], ids[2]]);
  assert.equal(edgeBlockId(blocks, [ids[1]!, ids[3]!], 1), ids[3]);
  assert.equal(edgeBlockId(blocks, [ids[1]!, ids[3]!], -1), ids[1]);
  assert.equal(adjacentBlockId(blocks, ids[1]!, 1), ids[2]);
  assert.equal(adjacentBlockId(blocks, ids[0]!, -1), null);
  assert.deepEqual(blockIdsBetween(blocks, "missing", ids[0]!), []);
});

test("parsed ids are stable and content equality ignores them", () => {
  const left = parseBlocks("- [ ] a\n- [ ] b");
  const right = parseBlocks("- [ ] a\n- [ ] b");
  assert.deepEqual(
    left.map((block) => block.id),
    ["p0", "p1"]
  );
  assert.deepEqual(
    right.map((block) => block.id),
    left.map((block) => block.id)
  );
  right[0]!.id = "other";
  assert.equal(blocksContentEqual(left, right), true);
});
