/**
 * Issue and comment text is stored as markdown so existing plain descriptions
 * keep working. The editor turns that string into blocks (headings, lists,
 * checkboxes, …) and back. The API uses the same parser when Cursor writes
 * a description, so the stored text renders with those blocks.
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

/** Shown to MCP clients so descriptions use marks the editor actually renders. */
export const ISSUE_DESCRIPTION_GUIDE =
  "Markdown, one block per line, using the same marks as the issue editor. " +
  "A blank line separates paragraphs. Nested lists and HTML are not rendered. " +
  "Blocks: `# Heading`, `## Heading`, `### Heading`, plain text, `- bullet`, " +
  "`1. numbered item` (numbers are normalized), `- [ ] checkbox`, `- [x] checked checkbox`, " +
  "`> quote`, a fenced code block opened with ```lang and closed with ```, and `---` for a divider. " +
  "Inline, inside a block: **bold**, *italic*, ~~strikethrough~~, `code`, and [label](https://example.com). " +
  "Mention a teammate with @ followed by their name or email.";

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

  const list = blocks.length > 0 ? blocks : [createBlock("paragraph")];
  // Index ids stay the same on the server and client. Random ids here mismatch
  // hydration and break selection, which looks blocks up by id.
  return list.map((block, index) => ({ ...block, id: `p${index}` }));
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

/** Store descriptions in the editor's serialized form. */
export function normalizeIssueMarkdown(input: string): string {
  const text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return "";
  return serializeBlocks(parseBlocks(text)).trim();
}
