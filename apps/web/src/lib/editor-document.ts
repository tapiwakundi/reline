/**
 * Issue and comment text is stored as markdown so existing plain descriptions
 * keep working. The editor turns that string into blocks (headings, lists,
 * checkboxes, …) and back.
 */

export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "todo"
  | "quote"
  | "code"
  | "divider";

export type Block = {
  id: string;
  type: BlockType;
  text: string;
  checked: boolean;
  /** Info string on a code fence, preserved when present. */
  language: string;
};

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "bold" | "italic" | "strike"; children: InlineNode[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: InlineNode[] };

let idSeq = 0;

export function createBlockId() {
  idSeq += 1;
  return `b${idSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createBlock(
  type: BlockType,
  text = "",
  extras?: { checked?: boolean; language?: string; id?: string }
): Block {
  return {
    id: extras?.id ?? createBlockId(),
    type,
    text,
    checked: type === "todo" ? Boolean(extras?.checked) : false,
    language: type === "code" ? (extras?.language ?? "") : "",
  };
}

export function parseBlocks(markdown: string): Block[] {
  if (!markdown) return [createBlock("paragraph")];

  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const content: string[] = [];
      i += 1;
      while (i < lines.length && lines[i] !== "```") {
        content.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length && lines[i] === "```") i += 1;
      blocks.push(createBlock("code", content.join("\n"), { language }));
      continue;
    }

    if (line === "---" || line === "***" || line === "___") {
      blocks.push(createBlock("divider"));
      i += 1;
      continue;
    }

    const heading = /^(#{1,3}) (.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const type: BlockType = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      blocks.push(createBlock(type, heading[2]!));
      i += 1;
      continue;
    }

    const todo = /^- \[([ xX])\] ?(.*)$/.exec(line);
    if (todo) {
      blocks.push(
        createBlock("todo", todo[2] ?? "", {
          checked: todo[1]!.toLowerCase() === "x",
        })
      );
      i += 1;
      continue;
    }

    const bullet = /^- (.*)$/.exec(line);
    if (bullet) {
      blocks.push(createBlock("bullet", bullet[1]!));
      i += 1;
      continue;
    }

    const starBullet = /^\* (.*)$/.exec(line);
    if (starBullet) {
      blocks.push(createBlock("bullet", starBullet[1]!));
      i += 1;
      continue;
    }

    const numbered = /^\d+\. (.*)$/.exec(line);
    if (numbered) {
      blocks.push(createBlock("numbered", numbered[1]!));
      i += 1;
      continue;
    }

    if (line === ">") {
      blocks.push(createBlock("quote", ""));
      i += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      blocks.push(createBlock("quote", line.slice(2)));
      i += 1;
      continue;
    }

    blocks.push(createBlock("paragraph", line));
    i += 1;
  }

  return blocks.length > 0 ? blocks : [createBlock("paragraph")];
}

export function serializeBlocks(blocks: Block[]): string {
  let number = 0;
  return blocks
    .map((block) => {
      if (block.type === "numbered") number += 1;
      else number = 0;
      return serializeBlock(block, number);
    })
    .join("\n");
}

function serializeBlock(block: Block, number: number): string {
  switch (block.type) {
    case "paragraph":
      return block.text;
    case "h1":
      return `# ${block.text}`;
    case "h2":
      return `## ${block.text}`;
    case "h3":
      return `### ${block.text}`;
    case "bullet":
      return `- ${block.text}`;
    case "numbered":
      return `${number}. ${block.text}`;
    case "todo":
      return `- [${block.checked ? "x" : " "}] ${block.text}`;
    case "quote":
      return `> ${block.text}`;
    case "code": {
      const info = block.language ? block.language : "";
      return "```" + info + "\n" + block.text + "\n```";
    }
    case "divider":
      return "---";
  }
}

/** List numbers restart after a non-numbered block. Todo indexes count every checkbox. */
export function enumerateBlocks(blocks: Block[]) {
  const rows: { block: Block; number: number; todoIndex: number }[] = [];
  let number = 0;
  let todoIndex = -1;
  for (const block of blocks) {
    if (block.type === "numbered") number += 1;
    else number = 0;
    if (block.type === "todo") todoIndex += 1;
    rows.push({ block, number, todoIndex });
  }
  return rows;
}

export function blocksContentEqual(a: Block[], b: Block[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((block, index) => {
    const other = b[index]!;
    return (
      block.type === other.type &&
      block.text === other.text &&
      block.checked === other.checked &&
      block.language === other.language
    );
  });
}

/**
 * True when `value` already describes `blocks`, even if serializing would
 * normalize fences or list numbers. Used so a parent echo does not rebuild
 * the editor and jump the caret.
 */
export function valueMatchesEditor(blocks: Block[], value: string): boolean {
  if (serializeBlocks(blocks) === value) return true;
  return blocksContentEqual(blocks, parseBlocks(value));
}

export function toggleTodo(markdown: string, index: number): string {
  const blocks = parseBlocks(markdown);
  let seen = 0;
  for (const block of blocks) {
    if (block.type !== "todo") continue;
    if (seen === index) {
      block.checked = !block.checked;
      break;
    }
    seen += 1;
  }
  return serializeBlocks(blocks);
}

export function isPlainDocument(text: string): boolean {
  if (!text) return true;
  const blocks = parseBlocks(text);
  if (blocks.some((block) => block.type !== "paragraph")) return false;
  return blocks.every((block) =>
    parseInline(block.text).every((node) => node.type === "text")
  );
}

export function parseInline(input: string): InlineNode[] {
  if (!input) return [];
  const nodes: InlineNode[] = [];
  let i = 0;
  let textStart = 0;

  const flush = (to: number) => {
    if (to > textStart) {
      nodes.push({ type: "text", value: input.slice(textStart, to) });
    }
    textStart = to;
  };

  while (i < input.length) {
    const token = readInlineToken(input, i);
    if (!token) {
      i += 1;
      continue;
    }
    flush(i);
    nodes.push(token.node);
    i = token.end;
    textStart = i;
  }

  flush(input.length);
  return nodes;
}

function readInlineToken(
  input: string,
  i: number
): { node: InlineNode; end: number } | null {
  const ch = input[i];
  if (ch !== "`" && ch !== "*" && ch !== "_" && ch !== "~" && ch !== "[") {
    return null;
  }

  if (ch === "`") {
    const close = input.indexOf("`", i + 1);
    if (close > i + 1 && !input.slice(i + 1, close).includes("\n")) {
      return {
        node: { type: "code", value: input.slice(i + 1, close) },
        end: close + 1,
      };
    }
    return null;
  }

  if (ch === "[") {
    const match = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/.exec(input.slice(i));
    if (match) {
      return {
        node: {
          type: "link",
          href: match[2]!,
          children: [{ type: "text", value: match[1]! }],
        },
        end: i + match[0].length,
      };
    }
    return null;
  }

  if (input.startsWith("**", i) || input.startsWith("__", i)) {
    const marker = input.startsWith("**", i) ? "**" : "__";
    const wrapped = readWrapped(input, i, marker, "bold");
    if (wrapped) return wrapped;
  }

  if (input.startsWith("~~", i)) {
    const wrapped = readWrapped(input, i, "~~", "strike");
    if (wrapped) return wrapped;
  }

  if (ch === "*" || ch === "_") {
    return readWrapped(input, i, ch, "italic");
  }

  return null;
}

function readWrapped(
  input: string,
  i: number,
  marker: string,
  type: "bold" | "italic" | "strike"
): { node: InlineNode; end: number } | null {
  if (!input.startsWith(marker, i)) return null;
  if (
    (marker === "*" || marker === "_") &&
    input.startsWith(marker + marker, i)
  ) {
    return null;
  }

  const contentStart = i + marker.length;
  const close = findCloser(input, contentStart, marker);
  if (close === -1) return null;

  const content = input.slice(contentStart, close);
  if (
    !content ||
    content.startsWith(" ") ||
    content.endsWith(" ") ||
    content.includes("\n")
  ) {
    return null;
  }

  if (marker === "_" || marker === "__") {
    const prev = i > 0 ? input[i - 1]! : "";
    const next = input[close + marker.length] ?? "";
    if (prev && /[A-Za-z0-9]/.test(prev)) return null;
    if (next && /[A-Za-z0-9]/.test(next)) return null;
  }

  return {
    node: { type, children: parseInline(content) },
    end: close + marker.length,
  };
}

function findCloser(input: string, from: number, marker: string): number {
  for (let i = from; i <= input.length - marker.length; i += 1) {
    if (!input.startsWith(marker, i)) continue;
    if (
      (marker === "*" || marker === "_") &&
      (input[i + marker.length] === marker || input[i - 1] === marker)
    ) {
      continue;
    }
    return i;
  }
  return -1;
}

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
    };

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
