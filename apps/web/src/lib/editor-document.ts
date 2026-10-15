/**
 * Issue and comment text is stored as markdown so existing plain descriptions
 * keep working. The editor turns that string into blocks (headings, lists,
 * checkboxes, …) and back. Parsing lives in @reline/shared so the API stores
 * the same markdown the editor renders.
 */

import { createBlock, parseBlocks } from "@reline/shared";
import type { Block, BlockType, InlineNode } from "@reline/shared";

export type { Block, BlockType, InlineNode };
export {
  blocksContentEqual,
  createBlock,
  createBlockId,
  enumerateBlocks,
  isPlainDocument,
  normalizeIssueMarkdown,
  parseBlocks,
  parseInline,
  serializeBlocks,
  toggleTodo,
  valueMatchesEditor,
} from "@reline/shared";

export type SlashCommandId =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "todo"
  | "quote"
  | "code"
  | "divider"
  | "bold"
  | "italic"
  | "strike"
  | "inlineCode";

export type SlashCommand = {
  id: SlashCommandId;
  label: string;
  description: string;
  keywords: string;
  group: "Turn into" | "Lists" | "Inline";
  shortcut: string;
  blockType?: BlockType;
  inlineMarker?: string;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "paragraph",
    label: "Text",
    description: "Plain paragraph",
    keywords: "text paragraph normal",
    group: "Turn into",
    shortcut: "",
    blockType: "paragraph",
  },
  {
    id: "h1",
    label: "Heading 1",
    description: "Large heading",
    keywords: "h1 heading title",
    group: "Turn into",
    shortcut: "#",
    blockType: "h1",
  },
  {
    id: "h2",
    label: "Heading 2",
    description: "Medium heading",
    keywords: "h2 heading subtitle",
    group: "Turn into",
    shortcut: "##",
    blockType: "h2",
  },
  {
    id: "h3",
    label: "Heading 3",
    description: "Small heading",
    keywords: "h3 heading",
    group: "Turn into",
    shortcut: "###",
    blockType: "h3",
  },
  {
    id: "bullet",
    label: "Bulleted list",
    description: "A simple bullet",
    keywords: "bullet bullets ul unordered list",
    group: "Lists",
    shortcut: "-",
    blockType: "bullet",
  },
  {
    id: "numbered",
    label: "Numbered list",
    description: "A numbered list",
    keywords: "number numbered ordered ol list",
    group: "Lists",
    shortcut: "1.",
    blockType: "numbered",
  },
  {
    id: "todo",
    label: "Checkboxes",
    description: "A to-do checkbox",
    keywords: "todo checkbox checkboxes check task box",
    group: "Lists",
    shortcut: "[]",
    blockType: "todo",
  },
  {
    id: "quote",
    label: "Quote",
    description: "A quoted line",
    keywords: "quote blockquote callout",
    group: "Turn into",
    shortcut: ">",
    blockType: "quote",
  },
  {
    id: "code",
    label: "Code block",
    description: "Code with formatting preserved",
    keywords: "code snippet block",
    group: "Turn into",
    shortcut: "```",
    blockType: "code",
  },
  {
    id: "divider",
    label: "Divider",
    description: "A horizontal line",
    keywords: "divider hr line separator rule",
    group: "Turn into",
    shortcut: "---",
    blockType: "divider",
  },
  {
    id: "bold",
    label: "Bold",
    description: "Bold text",
    keywords: "bold strong",
    group: "Inline",
    shortcut: "**",
    inlineMarker: "**",
  },
  {
    id: "italic",
    label: "Italic",
    description: "Italic text",
    keywords: "italic emphasis em",
    group: "Inline",
    shortcut: "*",
    inlineMarker: "*",
  },
  {
    id: "strike",
    label: "Strikethrough",
    description: "Crossed-out text",
    keywords: "strike strikethrough del",
    group: "Inline",
    shortcut: "~~",
    inlineMarker: "~~",
  },
  {
    id: "inlineCode",
    label: "Inline code",
    description: "Code within a line",
    keywords: "code inline",
    group: "Inline",
    shortcut: "`",
    inlineMarker: "`",
  },
];

export function filterSlashCommands(query: string): SlashCommand[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((command) => {
    const haystack = `${command.label} ${command.keywords} ${command.shortcut}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export type SlashHit = { query: string; start: number; end: number };

/** Slash menu opens at a `/` that starts a line or follows whitespace. */
export function detectSlash(text: string, caret: number): SlashHit | null {
  const before = text.slice(0, Math.max(0, caret));
  const slash = before.lastIndexOf("/");
  if (slash < 0) return null;
  if (slash > 0 && !/\s/.test(before[slash - 1]!)) return null;
  const query = before.slice(slash + 1);
  if (query.includes("\n")) return null;
  return { query, start: slash, end: caret };
}

export type MentionHit = { query: string; start: number; end: number };

/** Same rules as the previous comment box: `@` starts a mention. */
export function detectMention(text: string, caret: number): MentionHit | null {
  const before = text.slice(0, Math.max(0, caret));
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && /[\w.]/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (query.includes("\n")) return null;
  if (/[,.!?;:]/.test(query)) return null;
  return { query, start: at, end: caret };
}

const SHORTCUTS: { prefix: string; type: BlockType; exact?: boolean }[] = [
  { prefix: "- [ ] ", type: "todo" },
  { prefix: "[] ", type: "todo" },
  { prefix: "[ ] ", type: "todo" },
  { prefix: "### ", type: "h3" },
  { prefix: "## ", type: "h2" },
  { prefix: "# ", type: "h1" },
  { prefix: "- ", type: "bullet" },
  { prefix: "* ", type: "bullet" },
  { prefix: "1. ", type: "numbered" },
  { prefix: "> ", type: "quote" },
  { prefix: "```", type: "code", exact: true },
  { prefix: "---", type: "divider", exact: true },
];

export type EditorSelection = { id: string; start: number; end: number };

export type EditorAction =
  | { type: "text"; blockId: string; text: string; caret: number }
  | { type: "enter"; blockId: string; caret: number }
  | { type: "backspace"; blockId: string }
  | { type: "delete-forward"; blockId: string }
  | { type: "toggle-todo"; blockId: string }
  | {
      type: "slash";
      blockId: string;
      commandId: SlashCommandId;
      start: number;
      end: number;
    }
  | { type: "paste"; blockId: string; caret: number; text: string }
  | {
      type: "wrap";
      blockId: string;
      start: number;
      end: number;
      marker: string;
    }
  | {
      type: "insert";
      blockId: string;
      start: number;
      end: number;
      insertion: string;
    }
  | { type: "set-type"; blockIds: string[]; blockType: BlockType }
  | { type: "wrap-many"; blockIds: string[]; marker: string };

/** Inclusive block ids from `fromId` through `toId`, in document order. */
export function blockIdsBetween(
  blocks: { id: string }[],
  fromId: string,
  toId: string
): string[] {
  const start = blocks.findIndex((block) => block.id === fromId);
  const end = blocks.findIndex((block) => block.id === toId);
  if (start < 0 || end < 0) return [];
  const [from, to] = start <= end ? [start, end] : [end, start];
  return blocks.slice(from, to + 1).map((block) => block.id);
}

export function edgeBlockId(
  blocks: { id: string }[],
  ids: string[],
  direction: -1 | 1
): string | null {
  const idSet = new Set(ids);
  let chosen: string | null = null;
  let chosenIndex = direction < 0 ? Number.POSITIVE_INFINITY : -1;
  blocks.forEach((block, index) => {
    if (!idSet.has(block.id)) return;
    if (direction < 0 ? index < chosenIndex : index > chosenIndex) {
      chosen = block.id;
      chosenIndex = index;
    }
  });
  return chosen;
}

export function adjacentBlockId(
  blocks: { id: string }[],
  id: string,
  direction: -1 | 1
): string | null {
  const index = blocks.findIndex((block) => block.id === id);
  if (index < 0) return null;
  return blocks[index + direction]?.id ?? null;
}

/**
 * Inner text when `text` is fully wrapped in `marker`. A single `*` does not
 * match bold (`**`).
 */
export function unwrapOuterMarker(text: string, marker: string): string | null {
  if (!marker || text.length < marker.length * 2) return null;
  if (!text.startsWith(marker) || !text.endsWith(marker)) return null;
  if (marker === "*" && text.startsWith("**") && text.endsWith("**")) return null;
  const inner = text.slice(marker.length, text.length - marker.length);
  if (!inner) return null;
  return inner;
}

export function blockIsWrapped(text: string, marker: string): boolean {
  return unwrapOuterMarker(text, marker) !== null;
}

/** True when the caret range sits inside a matching pair of markers. */
export function rangeIsWrapped(
  text: string,
  start: number,
  end: number,
  marker: string
): boolean {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  if (!marker || from === to) return false;
  if (from < marker.length || to + marker.length > text.length) return false;
  if (text.slice(from - marker.length, from) !== marker) return false;
  if (text.slice(to, to + marker.length) !== marker) return false;
  if (marker === "*") {
    if (text[from - marker.length - 1] === "*") return false;
    if (text[to + marker.length] === "*") return false;
  }
  return true;
}

export type EditorResult = {
  handled: boolean;
  blocks: Block[];
  /**
   * Present only when the editor must move the caret. Ordinary typing omits
   * this so the browser keeps the caret where the user put it.
   */
  selection?: EditorSelection;
};

export function reduceEditor(blocks: Block[], action: EditorAction): EditorResult {
  if (action.type === "set-type") {
    return applySetType(blocks, action.blockIds, action.blockType);
  }
  if (action.type === "wrap-many") {
    return applyWrapMany(blocks, action.blockIds, action.marker);
  }

  const index = blocks.findIndex((block) => block.id === action.blockId);
  if (index === -1) return { handled: false, blocks };

  switch (action.type) {
    case "text":
      return applyText(blocks, index, action.text, action.caret);
    case "enter":
      return applyEnter(blocks, index, action.caret);
    case "backspace":
      return applyBackspace(blocks, index);
    case "delete-forward":
      return applyDeleteForward(blocks, index);
    case "toggle-todo":
      return applyToggle(blocks, index);
    case "slash":
      return applySlash(blocks, index, action);
    case "paste":
      return applyPaste(blocks, index, action.caret, action.text);
    case "wrap":
      return applyWrap(blocks, index, action.start, action.end, action.marker);
    case "insert":
      return applyInsert(blocks, index, action.start, action.end, action.insertion);
  }
}

function applySetType(
  blocks: Block[],
  ids: string[],
  blockType: BlockType
): EditorResult {
  const idSet = new Set(ids);
  if (idSet.size === 0) return { handled: false, blocks };
  let matched = false;
  const next = blocks.map((block) => {
    if (!idSet.has(block.id)) return block;
    matched = true;
    if (block.type === blockType) return block;
    return {
      ...block,
      type: blockType,
      checked: false,
      language: "",
    };
  });
  if (!matched) return { handled: false, blocks };
  return { handled: true, blocks: next };
}

function applyWrapMany(blocks: Block[], ids: string[], marker: string): EditorResult {
  const idSet = new Set(ids);
  if (idSet.size === 0 || !marker) return { handled: false, blocks };
  let changed = false;
  const next = blocks.map((block) => {
    if (!idSet.has(block.id) || block.type === "divider" || !block.text) return block;
    const unwrapped = unwrapOuterMarker(block.text, marker);
    const text = unwrapped ?? `${marker}${block.text}${marker}`;
    if (text === block.text) return block;
    changed = true;
    return { ...block, text };
  });
  if (!changed) return { handled: false, blocks };
  return { handled: true, blocks: next };
}

function applyText(
  blocks: Block[],
  index: number,
  text: string,
  caret: number
): EditorResult {
  const current = blocks[index]!;
  if (current.type !== "code" && !text.includes("\n")) {
    const shortcut = matchShortcut(text, caret);
    if (shortcut) {
      return commitPromotion(blocks, index, shortcut, text, caret, shortcut.prefixLength);
    }
    if (current.type === "paragraph") {
      const pasted = matchWholeLine(text);
      if (pasted) {
        const prefixLength = text.length - pasted.text.length;
        return commitPromotion(blocks, index, pasted, text, caret, prefixLength);
      }
    }
  }

  const next = blocks.map((block, i) =>
    i === index ? { ...current, text } : block
  );
  return { handled: true, blocks: next };
}

function matchShortcut(
  text: string,
  caret: number
): { type: BlockType; text: string; checked: boolean; prefixLength: number } | null {
  for (const shortcut of SHORTCUTS) {
    if (caret !== shortcut.prefix.length) continue;
    if (!text.startsWith(shortcut.prefix)) continue;
    if (shortcut.exact && text !== shortcut.prefix) continue;
    return {
      type: shortcut.type,
      text: text.slice(shortcut.prefix.length),
      checked: false,
      prefixLength: shortcut.prefix.length,
    };
  }
  return null;
}

function matchWholeLine(
  text: string
): { type: BlockType; text: string; checked: boolean; language: string } | null {
  const parsed = parseBlocks(text);
  if (parsed.length !== 1) return null;
  const block = parsed[0]!;
  if (block.type === "paragraph") return null;
  return {
    type: block.type,
    text: block.text,
    checked: block.checked,
    language: block.language,
  };
}

function commitPromotion(
  blocks: Block[],
  index: number,
  promoted: { type: BlockType; text: string; checked: boolean; language?: string },
  raw: string,
  caret: number,
  prefixLength: number
): EditorResult {
  const current = blocks[index]!;
  const block = createBlock(promoted.type, promoted.text, {
    id: current.id,
    checked: promoted.checked,
    language: promoted.language,
  });

  if (promoted.type === "divider") {
    const paragraph = createBlock("paragraph");
    const next = [
      ...blocks.slice(0, index),
      block,
      paragraph,
      ...blocks.slice(index + 1),
    ];
    return {
      handled: true,
      blocks: next,
      selection: { id: paragraph.id, start: 0, end: 0 },
    };
  }

  const next = blocks.map((item, i) => (i === index ? block : item));
  const start =
    caret >= raw.length
      ? promoted.text.length
      : Math.max(0, Math.min(promoted.text.length, caret - prefixLength));
  return {
    handled: true,
    blocks: next,
    selection: { id: block.id, start, end: start },
  };
}

function applyEnter(blocks: Block[], index: number, caret: number): EditorResult {
  const current = blocks[index]!;

  if (current.type === "divider") {
    const paragraph = createBlock("paragraph");
    const next = [
      ...blocks.slice(0, index + 1),
      paragraph,
      ...blocks.slice(index + 1),
    ];
    return {
      handled: true,
      blocks: next,
      selection: { id: paragraph.id, start: 0, end: 0 },
    };
  }

  if (!current.text && current.type !== "paragraph") {
    const paragraph = { ...current, type: "paragraph" as const, checked: false, language: "" };
    const next = blocks.map((block, i) => (i === index ? paragraph : block));
    return {
      handled: true,
      blocks: next,
      selection: { id: paragraph.id, start: 0, end: 0 },
    };
  }

  const left = current.text.slice(0, caret);
  const right = current.text.slice(caret);
  const continueType = continuesOnEnter(current.type) ? current.type : "paragraph";
  const updated = { ...current, text: left };
  const created = createBlock(continueType, right);
  const next = [
    ...blocks.slice(0, index),
    updated,
    created,
    ...blocks.slice(index + 1),
  ];
  return {
    handled: true,
    blocks: next,
    selection: { id: created.id, start: 0, end: 0 },
  };
}

function continuesOnEnter(type: BlockType) {
  return (
    type === "bullet" ||
    type === "numbered" ||
    type === "todo" ||
    type === "quote"
  );
}

function applyBackspace(blocks: Block[], index: number): EditorResult {
  const current = blocks[index]!;

  if (current.type === "divider") {
    return removeBlock(blocks, index, -1);
  }

  if (current.type !== "paragraph") {
    const paragraph = {
      ...current,
      type: "paragraph" as const,
      checked: false,
      language: "",
    };
    const next = blocks.map((block, i) => (i === index ? paragraph : block));
    return {
      handled: true,
      blocks: next,
      selection: { id: paragraph.id, start: 0, end: 0 },
    };
  }

  if (index === 0) return { handled: false, blocks };

  const previous = blocks[index - 1]!;
  if (previous.type === "divider") {
    const next = blocks.filter((block) => block.id !== previous.id);
    return {
      handled: true,
      blocks: next,
      selection: { id: current.id, start: 0, end: 0 },
    };
  }

  const caret = previous.text.length;
  const glue = previous.type === "code" && previous.text ? "\n" : "";
  const merged = { ...previous, text: previous.text + glue + current.text };
  const next = [
    ...blocks.slice(0, index - 1),
    merged,
    ...blocks.slice(index + 1),
  ];
  return {
    handled: true,
    blocks: ensureBlocks(next),
    selection: { id: merged.id, start: caret + glue.length, end: caret + glue.length },
  };
}

function applyDeleteForward(blocks: Block[], index: number): EditorResult {
  const current = blocks[index]!;
  const nextBlock = blocks[index + 1];
  if (!nextBlock) return { handled: false, blocks };

  if (current.type === "divider") {
    return removeBlock(blocks, index, 1);
  }

  if (!nextBlock.text && nextBlock.type === "paragraph") {
    const next = blocks.filter((block) => block.id !== nextBlock.id);
    return {
      handled: true,
      blocks: ensureBlocks(next),
      selection: { id: current.id, start: current.text.length, end: current.text.length },
    };
  }

  if (nextBlock.type === current.type && current.type !== "code") {
    const caret = current.text.length;
    const merged = { ...current, text: current.text + nextBlock.text };
    const next = [
      ...blocks.slice(0, index),
      merged,
      ...blocks.slice(index + 2),
    ];
    return {
      handled: true,
      blocks: next,
      selection: { id: merged.id, start: caret, end: caret },
    };
  }

  return {
    handled: true,
    blocks,
    selection: { id: nextBlock.id, start: 0, end: 0 },
  };
}

function removeBlock(blocks: Block[], index: number, direction: -1 | 1): EditorResult {
  const removed = blocks[index]!;
  const next = blocks.filter((block) => block.id !== removed.id);
  const safe = ensureBlocks(next);
  const neighbor = safe[Math.max(0, Math.min(safe.length - 1, index + (direction < 0 ? -1 : 0)))]!;
  const caret = direction < 0 ? neighbor.text.length : 0;
  return {
    handled: true,
    blocks: safe,
    selection: { id: neighbor.id, start: caret, end: caret },
  };
}

function applyToggle(blocks: Block[], index: number): EditorResult {
  const current = blocks[index]!;
  if (current.type !== "todo") return { handled: false, blocks };
  const next = blocks.map((block, i) =>
    i === index ? { ...current, checked: !current.checked } : block
  );
  return { handled: true, blocks: next };
}

function applySlash(
  blocks: Block[],
  index: number,
  action: Extract<EditorAction, { type: "slash" }>
): EditorResult {
  const current = blocks[index]!;
  const command = SLASH_COMMANDS.find((item) => item.id === action.commandId);
  if (!command) return { handled: false, blocks };

  const before = current.text.slice(0, action.start);
  const after = current.text.slice(action.end);

  if (command.inlineMarker) {
    const marker = command.inlineMarker;
    const placeholder = "text";
    const insertion = `${marker}${placeholder}${marker}`;
    const text = before + insertion + after;
    const start = before.length + marker.length;
    const block = {
      ...current,
      type: current.type === "divider" ? ("paragraph" as const) : current.type,
      text,
    };
    const next = blocks.map((item, i) => (i === index ? block : item));
    return {
      handled: true,
      blocks: next,
      selection: { id: block.id, start, end: start + placeholder.length },
    };
  }

  const blockType = command.blockType ?? "paragraph";
  if (blockType === "divider") {
    const pieces: Block[] = [];
    if (before + after) {
      pieces.push({ ...current, text: before + after });
    }
    pieces.push(createBlock("divider"));
    const paragraph = createBlock("paragraph");
    pieces.push(paragraph);
    const next = [...blocks.slice(0, index), ...pieces, ...blocks.slice(index + 1)];
    return {
      handled: true,
      blocks: next,
      selection: { id: paragraph.id, start: 0, end: 0 },
    };
  }

  const block = createBlock(blockType, before + after, { id: current.id });
  const next = blocks.map((item, i) => (i === index ? block : item));
  const caret = before.length;
  return {
    handled: true,
    blocks: next,
    selection: { id: block.id, start: caret, end: caret },
  };
}

function applyWrap(
  blocks: Block[],
  index: number,
  start: number,
  end: number,
  marker: string
): EditorResult {
  const current = blocks[index]!;
  if (current.type === "divider") return { handled: false, blocks };

  const wrapped = wrapRange(current.text, start, end, marker);
  const block = { ...current, text: wrapped.text };
  const next = blocks.map((item, i) => (i === index ? block : item));
  return {
    handled: true,
    blocks: next,
    selection: { id: block.id, start: wrapped.start, end: wrapped.end },
  };
}

export function wrapRange(
  text: string,
  start: number,
  end: number,
  marker: string
): { text: string; start: number; end: number } {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  if (from === to) {
    const next = text.slice(0, from) + marker + marker + text.slice(to);
    const caret = from + marker.length;
    return { text: next, start: caret, end: caret };
  }

  const selected = text.slice(from, to);
  const before = text.slice(Math.max(0, from - marker.length), from);
  const after = text.slice(to, to + marker.length);
  if (before === marker && after === marker) {
    const next =
      text.slice(0, from - marker.length) + selected + text.slice(to + marker.length);
    const sel = from - marker.length;
    return { text: next, start: sel, end: sel + selected.length };
  }

  const next = text.slice(0, from) + marker + selected + marker + text.slice(to);
  return {
    text: next,
    start: from + marker.length,
    end: to + marker.length,
  };
}

function applyInsert(
  blocks: Block[],
  index: number,
  start: number,
  end: number,
  insertion: string
): EditorResult {
  const current = blocks[index]!;
  const text = current.text.slice(0, start) + insertion + current.text.slice(end);
  const caret = start + insertion.length;
  const block = { ...current, text };
  const next = blocks.map((item, i) => (i === index ? block : item));
  return {
    handled: true,
    blocks: next,
    selection: { id: block.id, start: caret, end: caret },
  };
}

function applyPaste(
  blocks: Block[],
  index: number,
  caret: number,
  pasted: string
): EditorResult {
  const normalized = pasted.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.includes("\n")) return { handled: false, blocks };

  const current = blocks[index]!;
  const before = current.text.slice(0, caret);
  const after = current.text.slice(caret);

  if (current.type === "code") {
    const text = before + normalized + after;
    const block = { ...current, text };
    const next = blocks.map((item, i) => (i === index ? block : item));
    const pos = before.length + normalized.length;
    return {
      handled: true,
      blocks: next,
      selection: { id: block.id, start: pos, end: pos },
    };
  }

  const inserted = parseBlocks(normalized);
  const plain = inserted.every((block) => block.type === "paragraph");
  const pieces: Block[] = [];

  if (plain && continuesOnEnter(current.type)) {
    inserted.forEach((block, pieceIndex) => {
      if (pieceIndex === 0) {
        pieces.push({
          ...current,
          text: before + block.text + (inserted.length === 1 ? after : ""),
        });
      } else if (pieceIndex === inserted.length - 1) {
        pieces.push(
          createBlock(current.type, block.text + after, { checked: false })
        );
      } else {
        pieces.push(createBlock(current.type, block.text));
      }
    });
  } else if (!before && !after) {
    for (const block of inserted) {
      pieces.push(createBlock(block.type, block.text, {
        checked: block.checked,
        language: block.language,
      }));
    }
  } else {
    const first = inserted[0]!;
    if (first.type === "paragraph" || (!before && first.type === current.type)) {
      pieces.push({ ...current, text: before + first.text });
    } else if (!before) {
      pieces.push(
        createBlock(first.type, first.text, {
          id: current.id,
          checked: first.checked,
          language: first.language,
        })
      );
    } else {
      pieces.push({ ...current, text: before });
      pieces.push(
        createBlock(first.type, first.text, {
          checked: first.checked,
          language: first.language,
        })
      );
    }
    for (const block of inserted.slice(1)) {
      pieces.push(
        createBlock(block.type, block.text, {
          checked: block.checked,
          language: block.language,
        })
      );
    }
    if (after) {
      const tail = pieces[pieces.length - 1]!;
      if (tail.type === "divider") {
        pieces.push(createBlock("paragraph", after));
      } else {
        tail.text += after;
      }
    }
  }

  const next = [...blocks.slice(0, index), ...pieces, ...blocks.slice(index + 1)];
  const focus = pieces[pieces.length - 1] ?? next[0]!;
  let pos = focus.text.length;
  if (after && focus.text.endsWith(after)) pos = focus.text.length - after.length;
  return {
    handled: true,
    blocks: ensureBlocks(next),
    selection: { id: focus.id, start: pos, end: pos },
  };
}

function ensureBlocks(blocks: Block[]) {
  return blocks.length > 0 ? blocks : [createBlock("paragraph")];
}
