"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  BoldIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  MinusIcon,
  StrikethroughIcon,
  TextQuoteIcon,
  TypeIcon,
} from "lucide-react";
import { TodoCheckbox } from "@/components/formatted-text";
import {
  SelectionToolbar,
  measureTextareaSelection,
  uniformBlockType,
  unionRect,
  type InlineMarker,
} from "@/components/selection-toolbar";
import { UserAvatar } from "@/components/user-avatar";
import {
  adjacentBlockId,
  blockIdsBetween,
  blockIsWrapped,
  detectMention,
  detectSlash,
  edgeBlockId,
  enumerateBlocks,
  filterSlashCommands,
  parseBlocks,
  rangeIsWrapped,
  reduceEditor,
  serializeBlocks,
  valueMatchesEditor,
  type Block,
  type BlockType,
  type EditorAction,
  type EditorSelection,
  type SlashCommand,
  type SlashCommandId,
} from "@/lib/editor-document";
import { mentionSpans } from "@/lib/mentions";
import type { Member } from "@/lib/types";
import { cn } from "@/lib/utils";

type Highlight =
  | {
      mode: "text";
      blockId: string;
      start: number;
      end: number;
      anchorId: string;
    }
  | { mode: "blocks"; ids: string[]; anchorId: string };

type DragState = {
  pointerId: number;
  anchorId: string;
  startX: number;
  startY: number;
  moved: boolean;
};

const INLINE_MARKERS = ["**", "*", "~~", "`"] as const;

type MenuState =
  | {
      kind: "slash";
      blockId: string;
      query: string;
      start: number;
      end: number;
    }
  | {
      kind: "mention";
      blockId: string;
      query: string;
      start: number;
      end: number;
    };

const ICONS: Record<SlashCommandId, typeof TypeIcon> = {
  paragraph: TypeIcon,
  h1: Heading1Icon,
  h2: Heading2Icon,
  h3: Heading3Icon,
  bullet: ListIcon,
  numbered: ListOrderedIcon,
  todo: ListTodoIcon,
  quote: TextQuoteIcon,
  code: CodeIcon,
  divider: MinusIcon,
  bold: BoldIcon,
  italic: ItalicIcon,
  strike: StrikethroughIcon,
  inlineCode: CodeIcon,
};

function resizeTextarea(el: HTMLTextAreaElement) {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const active = document.activeElement === el;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
  // Growing the field must not park the caret at the end.
  if (active && (el.selectionStart !== start || el.selectionEnd !== end)) {
    el.setSelectionRange(start, end);
  }
}

function AnchoredMenu({
  anchor,
  placement,
  children,
  testId,
  menuRef,
}: {
  anchor: HTMLElement | null;
  placement: "top" | "bottom";
  children: ReactNode;
  testId: string;
  menuRef: RefObject<HTMLDivElement | null>;
}) {
  const [style, setStyle] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    function update() {
      const rect = anchor!.getBoundingClientRect();
      const width = 288;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUp =
        placement === "top" || (spaceBelow < 220 && spaceAbove > spaceBelow);
      const maxHeight = Math.max(
        140,
        Math.min(320, (openUp ? spaceAbove : spaceBelow) - 12)
      );
      setStyle({
        left,
        width,
        maxHeight,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, placement]);

  if (!anchor || !style) return null;
  return createPortal(
    <div
      ref={menuRef}
      data-testid={testId}
      style={{ position: "fixed", zIndex: 80, ...style }}
      className="overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg"
    >
      {children}
    </div>,
    document.body
  );
}

/** Same characters as the field, with resolved @mentions painted in place. */
function MentionOverlay({ text, members }: { text: string; members: Member[] }) {
  const spans = mentionSpans(text, members);
  if (spans.length === 0) return <>{text}</>;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, index) => {
    if (span.start > cursor) {
      nodes.push(text.slice(cursor, span.start));
    }
    nodes.push(
      <span
        key={index}
        className="-mx-0.5 rounded bg-primary/15 px-0.5 text-primary"
        title={span.member.email}
      >
        {text.slice(span.start, span.end)}
      </span>
    );
    cursor = span.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

function blockPlaceholder(block: Block, loneEmpty: boolean, placeholder?: string) {
  if (loneEmpty && block.type === "paragraph") return placeholder ?? "";
  switch (block.type) {
    case "h1":
      return "Heading 1";
    case "h2":
      return "Heading 2";
    case "h3":
      return "Heading 3";
    case "bullet":
    case "numbered":
    case "todo":
      return "List";
    case "quote":
      return "Quote";
    case "code":
      return "Write code…";
    default:
      return "";
  }
}

export function BlockEditor({
  value,
  onChange,
  members = [],
  placeholder = "Type / to format, @ to mention",
  autoFocus = false,
  initialBlockIndex = null,
  onBlur,
  onSubmit,
  onCancel,
  onPasteFiles,
  menuPlacement = "bottom",
  density = "body",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  members?: Member[];
  placeholder?: string;
  autoFocus?: boolean;
  /** Block to focus when the editor opens. Omit to focus the end. */
  initialBlockIndex?: number | null;
  onBlur?: () => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  /** Return true when the files were accepted so the text paste is skipped. */
  onPasteFiles?: (files: File[]) => boolean;
  menuPlacement?: "top" | "bottom";
  density?: "body" | "comment";
  className?: string;
}) {
  const [blocks, setBlocks] = useState(() => parseBlocks(value));
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [active, setActive] = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [selecting, setSelecting] = useState(false);
  const blocksRef = useRef(blocks);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const onSubmitRef = useRef(onSubmit);
  const onCancelRef = useRef(onCancel);
  const onPasteFilesRef = useRef(onPasteFiles);
  const menuNodeRef = useRef<HTMLDivElement>(null);
  const membersRef = useRef(members);
  const areaRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingCaret = useRef<EditorSelection | null>(null);
  const applyingSelection = useRef(false);
  const composing = useRef(false);
  const didAutoFocus = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<Highlight | null>(null);
  const selectionLock = useRef(false);
  const blockGesture = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const focusedIdRef = useRef<string | null>(null);
  const retainFocus = useRef(false);
  const applyBlockHighlightRef = useRef<(ids: string[], anchorId: string) => void>(
    () => {}
  );
  const blockIdAtPointRef = useRef<(x: number, y: number) => string | null>(() => null);

  highlightRef.current = highlight;

  blocksRef.current = blocks;
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;
  onSubmitRef.current = onSubmit;
  onCancelRef.current = onCancel;
  onPasteFilesRef.current = onPasteFiles;
  membersRef.current = members;

  useEffect(() => {
    if (valueMatchesEditor(blocksRef.current, value)) return;
    const parsed = parseBlocks(value);
    blocksRef.current = parsed;
    setBlocks(parsed);
    setMenu(null);
    setHighlight(null);
  }, [value]);

  useLayoutEffect(() => {
    for (const el of areaRefs.current.values()) resizeTextarea(el);
  }, [blocks]);

  // Move the caret only after structural edits. Typing leaves this empty.
  useLayoutEffect(() => {
    const pending = pendingCaret.current;
    if (!pending) return;
    pendingCaret.current = null;
    const el = areaRefs.current.get(pending.id);
    if (!el) return;
    applyingSelection.current = true;
    el.focus();
    const start = Math.max(0, Math.min(pending.start, el.value.length));
    const end = Math.max(start, Math.min(pending.end, el.value.length));
    el.setSelectionRange(start, end);
    applyingSelection.current = false;
  }, [blocks]);

  useLayoutEffect(() => {
    if (!autoFocus || didAutoFocus.current) return;
    didAutoFocus.current = true;
    const list = blocksRef.current;
    const index =
      initialBlockIndex == null
        ? list.length - 1
        : Math.max(0, Math.min(initialBlockIndex, list.length - 1));
    const target = [...list]
      .slice(0, index + 1)
      .reverse()
      .find((block) => block.type !== "divider");
    if (!target) return;
    const el = areaRefs.current.get(target.id);
    if (!el) return;
    applyingSelection.current = true;
    el.focus();
    const pos = el.value.length;
    el.setSelectionRange(pos, pos);
    applyingSelection.current = false;
  }, [autoFocus, initialBlockIndex]);

  useLayoutEffect(() => {
    if (retainFocus.current) {
      retainFocus.current = false;
      const root = rootRef.current;
      if (root && !root.contains(document.activeElement)) root.focus();
    }
    const current = highlightRef.current;
    if (!current || current.mode !== "text" || selecting) return;
    const el = areaRefs.current.get(current.blockId);
    if (!el || document.activeElement !== el) return;
    if (el.selectionStart !== el.selectionEnd) return;
    if (current.start === current.end) return;
    applyingSelection.current = true;
    const start = Math.max(0, Math.min(current.start, el.value.length));
    const end = Math.max(start, Math.min(current.end, el.value.length));
    el.setSelectionRange(start, end);
    applyingSelection.current = false;
  }, [blocks, highlight, selecting]);

  useEffect(() => {
    function onMove(event: PointerEvent | MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if ("pointerId" in event && event.pointerId !== drag.pointerId) return;
      // A textarea text-selection drag often reports buttons as 0 on later moves.
      const blockId = blockIdAtPointRef.current(event.clientX, event.clientY);
      if (!blockId || blockId === drag.anchorId) return;
      if (!drag.moved) {
        const dy = Math.abs(event.clientY - drag.startY);
        if (dy < 4) return;
      }
      drag.moved = true;
      blockGesture.current = true;
      const ids = blockIdsBetween(blocksRef.current, drag.anchorId, blockId);
      const current = highlightRef.current;
      if (
        current?.mode === "blocks" &&
        current.ids.length === ids.length &&
        current.ids.every((id, index) => id === ids[index])
      ) {
        return;
      }
      applyBlockHighlightRef.current(ids, drag.anchorId);
    }

    function onUp() {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      if (drag.moved) {
        selectionLock.current = true;
        requestAnimationFrame(() => {
          selectionLock.current = false;
          blockGesture.current = false;
        });
      } else {
        blockGesture.current = false;
      }
      setSelecting(false);
    }

    function onDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-selection-toolbar]")) return;
      setHighlight(null);
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("pointercancel", onUp);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.removeEventListener("pointerdown", onDown);
    };
  }, []);

  function commit(action: EditorAction) {
    const active = document.activeElement;
    let activeId: string | null = null;
    if (active instanceof HTMLTextAreaElement) {
      for (const [id, el] of areaRefs.current) {
        if (el === active) activeId = id;
      }
    }
    const result = reduceEditor(blocksRef.current, action);
    if (!result.handled) return result;
    blocksRef.current = result.blocks;
    setBlocks(result.blocks);
    onChangeRef.current(serializeBlocks(result.blocks));
    if (result.selection) pendingCaret.current = result.selection;
    if (action.type !== "text" || result.selection) setMenu(null);
    const keepHighlight =
      action.type === "set-type" ||
      action.type === "wrap" ||
      action.type === "wrap-many";
    if (!keepHighlight) setHighlight(null);
    if (activeId) {
      const updated = result.blocks.find((block) => block.id === activeId);
      if (!updated || updated.type === "divider") retainFocus.current = true;
    }
    return result;
  }

  function applyBlockHighlight(ids: string[], anchorId: string) {
    if (ids.length === 0) return;
    selectionLock.current = true;
    setMenu(null);
    setHighlight({ mode: "blocks", ids, anchorId });
    const active = document.activeElement;
    if (
      active instanceof HTMLTextAreaElement &&
      rootRef.current?.contains(active)
    ) {
      const pos = active.selectionStart;
      active.setSelectionRange(pos, pos);
    }
    requestAnimationFrame(() => {
      selectionLock.current = false;
    });
  }
  applyBlockHighlightRef.current = applyBlockHighlight;

  function blockIdAtPoint(x: number, y: number): string | null {
    const root = rootRef.current;
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (el.closest("[data-selection-toolbar]")) continue;
      if (!root?.contains(el)) continue;
      const direct = el.closest("[data-block-id]")?.getAttribute("data-block-id");
      if (direct) return direct;
    }
    let best: { id: string; dist: number } | null = null;
    for (const [id, node] of rowRefs.current) {
      const rect = node.getBoundingClientRect();
      if (y < rect.top - 12 || y > rect.bottom + 12) continue;
      const dist = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      if (!best || dist < best.dist) best = { id, dist };
    }
    return best?.id ?? null;
  }
  blockIdAtPointRef.current = blockIdAtPoint;

  function highlightRect(): DOMRect | null {
    const current = highlightRef.current;
    if (!current) return null;
    if (current.mode === "text") {
      const el = areaRefs.current.get(current.blockId);
      if (!el) return null;
      return measureTextareaSelection(el, current.start, current.end);
    }
    const rects: DOMRect[] = [];
    for (const id of current.ids) {
      const row = rowRefs.current.get(id);
      if (row) rects.push(row.getBoundingClientRect());
    }
    return unionRect(rects);
  }

  function onTurnInto(blockType: BlockType) {
    const current = highlightRef.current;
    if (!current) return;
    const ids = current.mode === "text" ? [current.blockId] : current.ids;
    if (blockType === "divider") {
      setHighlight({ mode: "blocks", ids, anchorId: current.anchorId });
    }
    commit({ type: "set-type", blockIds: ids, blockType });
  }

  function formatRange(
    blockId: string,
    start: number,
    end: number,
    marker: string
  ) {
    const result = commit({ type: "wrap", blockId, start, end, marker });
    if (result.selection && start !== end) {
      setHighlight({
        mode: "text",
        blockId: result.selection.id,
        start: result.selection.start,
        end: result.selection.end,
        anchorId: result.selection.id,
      });
    }
    return result;
  }

  function onInline(marker: InlineMarker) {
    const current = highlightRef.current;
    if (!current) return;
    if (current.mode === "text") {
      formatRange(current.blockId, current.start, current.end, marker);
      return;
    }
    commit({ type: "wrap-many", blockIds: current.ids, marker });
  }

  function focusBlock(id: string, caret: number) {
    const el = areaRefs.current.get(id);
    if (!el) {
      pendingCaret.current = { id, start: caret, end: caret };
      return;
    }
    applyingSelection.current = true;
    el.focus();
    const pos = Math.max(0, Math.min(caret, el.value.length));
    el.setSelectionRange(pos, pos);
    applyingSelection.current = false;
  }

  function focusNeighbor(blockId: string, direction: -1 | 1) {
    const list = blocksRef.current;
    let index = list.findIndex((block) => block.id === blockId);
    if (index === -1) return;
    index += direction;
    while (list[index]?.type === "divider") index += direction;
    const target = list[index];
    if (!target || target.type === "divider") return;
    focusBlock(target.id, direction < 0 ? target.text.length : 0);
  }

  function filterMembers(query: string) {
    const q = query.toLowerCase();
    return membersRef.current
      .filter(
        (member) =>
          !q ||
          member.name.toLowerCase().includes(q) ||
          member.email.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }

  function syncMenu(block: Block, text: string, caret: number) {
    if (block.type === "code") {
      setMenu(null);
      return;
    }
    const slash = detectSlash(text, caret);
    const mention = membersRef.current.length ? detectMention(text, caret) : null;
    let next: MenuState | null = null;
    if (slash && (!mention || slash.start >= mention.start)) {
      if (filterSlashCommands(slash.query).length > 0) {
        next = { kind: "slash", blockId: block.id, ...slash };
      }
    }
    if (!next && mention && filterMembers(mention.query).length > 0) {
      next = { kind: "mention", blockId: block.id, ...mention };
    }
    setMenu((current) => {
      if (!next && !current) return current;
      if (
        next &&
        current &&
        current.kind === next.kind &&
        current.blockId === next.blockId &&
        current.query === next.query &&
        current.start === next.start &&
        current.end === next.end
      ) {
        return current;
      }
      return next;
    });
  }

  const slashMatches =
    menu?.kind === "slash" ? filterSlashCommands(menu.query) : [];
  const mentionMatches =
    menu?.kind === "mention" ? filterMembers(menu.query) : [];
  const menuQuery = menu ? `${menu.kind}:${menu.query}` : "";

  useEffect(() => {
    setActive(0);
  }, [menuQuery]);

  useEffect(() => {
    const root = menuNodeRef.current;
    const item = root?.querySelector<HTMLElement>("[data-menu-active='true']");
    if (!root || !item) return;
    const itemRect = item.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    if (itemRect.bottom > rootRect.bottom) {
      root.scrollTop += itemRect.bottom - rootRect.bottom;
    } else if (itemRect.top < rootRect.top) {
      root.scrollTop -= rootRect.top - itemRect.top;
    }
  }, [active, menuQuery]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, block: Block) {
    const el = event.currentTarget;
    const menuForBlock = menu && menu.blockId === block.id ? menu : null;

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmitRef.current?.();
      return;
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "b"
    ) {
      event.preventDefault();
      if (highlightRef.current?.mode === "blocks") onInline("**");
      else formatRange(block.id, el.selectionStart, el.selectionEnd, "**");
      return;
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "i"
    ) {
      event.preventDefault();
      if (highlightRef.current?.mode === "blocks") onInline("*");
      else formatRange(block.id, el.selectionStart, el.selectionEnd, "*");
      return;
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "a"
    ) {
      const coversBlock = el.selectionStart === 0 && el.selectionEnd === el.value.length;
      if (coversBlock && blocksRef.current.length > 1) {
        event.preventDefault();
        applyBlockHighlight(
          blocksRef.current.map((item) => item.id),
          block.id
        );
        return;
      }
    }

    if (menuForBlock?.kind === "slash" && slashMatches.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((index) => (index + 1) % slashMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => (index - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const command = slashMatches[Math.min(active, slashMatches.length - 1)];
        if (command) chooseSlash(command);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(null);
        return;
      }
    }

    if (menuForBlock?.kind === "mention" && mentionMatches.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((index) => (index + 1) % mentionMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => (index - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const member = mentionMatches[Math.min(active, mentionMatches.length - 1)];
        if (member) chooseMention(member);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(null);
        return;
      }
    }

    if (event.key === "Escape" && highlightRef.current) {
      event.preventDefault();
      setHighlight(null);
      return;
    }

    if (event.key === "Escape" && onCancelRef.current) {
      event.preventDefault();
      onCancelRef.current();
      return;
    }

    if (
      (event.key === "ArrowUp" || event.key === "ArrowDown") &&
      event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !menuForBlock
    ) {
      const direction = event.key === "ArrowUp" ? -1 : 1;
      const atEdge =
        direction < 0 ? el.selectionStart === 0 : el.selectionEnd === el.value.length;
      if (atEdge) {
        const anchor = highlightRef.current?.anchorId ?? block.id;
        const edge =
          highlightRef.current?.mode === "blocks"
            ? edgeBlockId(blocksRef.current, highlightRef.current.ids, direction)
            : block.id;
        const neighbor = edge
          ? adjacentBlockId(blocksRef.current, edge, direction)
          : null;
        if (neighbor) {
          event.preventDefault();
          applyBlockHighlight(blockIdsBetween(blocksRef.current, anchor, neighbor), anchor);
          return;
        }
      }
    }

    if (event.key === "Enter" && !event.shiftKey && block.type !== "code") {
      event.preventDefault();
      commit({ type: "enter", blockId: block.id, caret: el.selectionStart });
      return;
    }

    if (
      event.key === "Backspace" &&
      el.selectionStart === 0 &&
      el.selectionEnd === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      const result = commit({ type: "backspace", blockId: block.id });
      if (result.handled) event.preventDefault();
      return;
    }

    if (
      event.key === "Delete" &&
      el.selectionStart === el.selectionEnd &&
      el.selectionStart === el.value.length &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      const result = commit({ type: "delete-forward", blockId: block.id });
      if (result.handled) event.preventDefault();
      return;
    }

    if (
      (event.key === "ArrowUp" || event.key === "ArrowDown") &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const direction = event.key === "ArrowUp" ? -1 : 1;
      const id = block.id;
      requestAnimationFrame(() => {
        if (document.activeElement !== el) return;
        if (el.selectionStart !== start || el.selectionEnd !== end) return;
        focusNeighbor(id, direction);
      });
    }
  }

  function chooseSlash(command: SlashCommand) {
    if (!menu || menu.kind !== "slash") return;
    commit({
      type: "slash",
      blockId: menu.blockId,
      commandId: command.id,
      start: menu.start,
      end: menu.end,
    });
  }

  function chooseMention(member: Member) {
    if (!menu || menu.kind !== "mention") return;
    commit({
      type: "insert",
      blockId: menu.blockId,
      start: menu.start,
      end: menu.end,
      insertion: `@${member.name} `,
    });
  }

  const loneEmpty =
    blocks.length === 1 &&
    blocks[0]!.type === "paragraph" &&
    blocks[0]!.text.length === 0;
  const compact = density === "comment";
  const rows = enumerateBlocks(blocks);
  const anchor = menu ? (rowRefs.current.get(menu.blockId) ?? null) : null;
  const slashRows = slashMatches.map((command, index) => ({
    command,
    index,
    showGroup: index === 0 || command.group !== slashMatches[index - 1]!.group,
  }));
  const toolbarBlocks = toolbarTargetBlocks(blocks, highlight, selecting, menu != null);
  const inlineActive = inlineFlags(toolbarBlocks, highlight);
  const inlineDisabled =
    highlight?.mode === "blocks" &&
    toolbarBlocks.every((block) => block.type === "divider" || block.text.length === 0);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={cn(
        "relative outline-none",
        highlight?.mode === "blocks" && selecting && "select-none",
        className
      )}
      onPointerDown={(event) => {
        if (event.button !== 0 || event.shiftKey) return;
        const target = event.target as HTMLElement;
        if (target.closest("button, a, input")) return;
        const blockId = target.closest("[data-block-id]")?.getAttribute("data-block-id");
        if (!blockId) return;
        dragRef.current = {
          pointerId: event.pointerId,
          anchorId: blockId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        };
        setSelecting(true);
      }}
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (event.shiftKey && event.button === 0) {
          const blockId = target.closest("[data-block-id]")?.getAttribute("data-block-id");
          if (blockId) {
            event.preventDefault();
            const anchor =
              highlightRef.current?.anchorId ?? focusedIdRef.current ?? blockId;
            applyBlockHighlight(
              blockIdsBetween(blocksRef.current, anchor, blockId),
              anchor
            );
            return;
          }
        }
        if (target.closest("textarea, button, a, input")) return;
        event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Escape" && highlightRef.current) {
          event.preventDefault();
          setHighlight(null);
        }
      }}
      onBlur={(event) => {
        const root = event.currentTarget;
        requestAnimationFrame(() => {
          const active = document.activeElement;
          if (active && root.contains(active)) return;
          if (active instanceof Element && active.closest("[data-selection-toolbar]")) {
            return;
          }
          onBlurRef.current?.();
        });
      }}
    >
      <div className="flex flex-col">
        {rows.map(({ block, number: itemNumber }, index) => {
          const textClass = cn(
            "w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-muted-foreground/50",
            compact ? "text-[13px] leading-6" : "text-sm leading-6",
            block.type === "h1" &&
              (compact
                ? "text-lg font-semibold leading-snug"
                : "text-xl font-semibold leading-snug"),
            block.type === "h2" &&
              (compact
                ? "text-base font-semibold leading-snug"
                : "text-lg font-semibold leading-snug"),
            block.type === "h3" && "text-base font-semibold leading-snug",
            block.type === "code" && "font-mono text-[13px] leading-6",
            block.type === "todo" &&
              block.checked &&
              "text-muted-foreground line-through"
          );

          return (
            <div
              key={block.id}
              data-block-id={block.id}
              data-selected={
                highlight?.mode === "blocks" && highlight.ids.includes(block.id)
                  ? "true"
                  : undefined
              }
              ref={(node) => {
                if (node) rowRefs.current.set(block.id, node);
                else rowRefs.current.delete(block.id);
              }}
              className={cn(
                index > 0 && block.type === "h1" && "mt-3",
                index > 0 && block.type === "h2" && "mt-2",
                index > 0 && block.type === "h3" && "mt-2",
                highlight?.mode === "blocks" &&
                  highlight.ids.includes(block.id) &&
                  "rounded-md bg-foreground/10"
              )}
            >
              {block.type === "divider" ? (
                <div
                  tabIndex={0}
                  role="separator"
                  className="py-2 outline-none"
                  onKeyDown={(event) => {
                    if (event.key === "Backspace") {
                      event.preventDefault();
                      commit({ type: "backspace", blockId: block.id });
                    } else if (event.key === "Delete") {
                      event.preventDefault();
                      commit({ type: "delete-forward", blockId: block.id });
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      commit({ type: "enter", blockId: block.id, caret: 0 });
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      focusNeighbor(block.id, -1);
                    } else if (event.key === "ArrowDown") {
                      event.preventDefault();
                      focusNeighbor(block.id, 1);
                    }
                  }}
                >
                  <hr className="border-border" />
                </div>
              ) : (
                <div
                  className={cn(
                    "flex items-start gap-2",
                    block.type === "quote" && "border-l-2 border-border pl-3",
                    block.type === "code" && "rounded-md bg-muted px-3 py-2"
                  )}
                >
                  {block.type === "bullet" ? (
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-foreground/80" />
                  ) : null}
                  {block.type === "numbered" ? (
                    <span className="w-5 shrink-0 pt-px text-right text-sm text-muted-foreground tabular-nums">
                      {itemNumber}.
                    </span>
                  ) : null}
                  {block.type === "todo" ? (
                    <TodoCheckbox
                      checked={block.checked}
                      onToggle={() =>
                        commit({ type: "toggle-todo", blockId: block.id })
                      }
                    />
                  ) : null}
                  <div key="field" className="relative min-w-0 flex-1">
                  <div
                    aria-hidden
                    className={cn(
                      textClass,
                      "pointer-events-none absolute inset-0 whitespace-pre-wrap break-words"
                    )}
                  >
                    <MentionOverlay text={block.text} members={members} />
                  </div>
                  <textarea
                    ref={(node) => {
                      if (node) {
                        areaRefs.current.set(block.id, node);
                        resizeTextarea(node);
                      } else {
                        areaRefs.current.delete(block.id);
                      }
                    }}
                    value={block.text}
                    rows={1}
                    placeholder={blockPlaceholder(block, loneEmpty, placeholder)}
                    className={cn(
                      textClass,
                      "relative z-10 whitespace-pre-wrap break-words text-transparent caret-foreground selection:bg-foreground/15 selection:text-transparent"
                    )}
                    onChange={(event) => {
                      const nextText = event.target.value;
                      const caret = event.target.selectionStart;
                      resizeTextarea(event.target);
                      if (composing.current) {
                        const next = blocksRef.current.map((item) =>
                          item.id === block.id ? { ...item, text: nextText } : item
                        );
                        blocksRef.current = next;
                        setBlocks(next);
                        onChangeRef.current(serializeBlocks(next));
                        return;
                      }
                      const result = commit({
                        type: "text",
                        blockId: block.id,
                        text: nextText,
                        caret,
                      });
                      if (!result.selection) {
                        const updated =
                          result.blocks.find((item) => item.id === block.id) ?? block;
                        syncMenu(updated, updated.text, caret);
                      }
                    }}
                    onFocus={() => {
                      focusedIdRef.current = block.id;
                    }}
                    onMouseDown={(event) => {
                      if (event.shiftKey || blockGesture.current || selecting) return;
                      if (highlightRef.current?.mode === "blocks") setHighlight(null);
                    }}
                    onKeyDown={(event) => onKeyDown(event, block)}
                    onClick={(event) => {
                      const el = event.currentTarget;
                      if (el.selectionStart !== el.selectionEnd) return;
                      syncMenu(block, el.value, el.selectionStart);
                    }}
                    onSelect={(event) => {
                      if (
                        applyingSelection.current ||
                        selectionLock.current ||
                        blockGesture.current
                      ) {
                        return;
                      }
                      const el = event.currentTarget;
                      const start = el.selectionStart;
                      const end = el.selectionEnd;
                      if (start !== end) {
                        setMenu(null);
                        setHighlight((current) => {
                          if (
                            current?.mode === "text" &&
                            current.blockId === block.id &&
                            current.start === start &&
                            current.end === end
                          ) {
                            return current;
                          }
                          return {
                            mode: "text",
                            blockId: block.id,
                            start,
                            end,
                            anchorId: block.id,
                          };
                        });
                        return;
                      }
                      setHighlight((current) => {
                        if (!current || current.mode === "blocks") return current;
                        return current.blockId === block.id ? null : current;
                      });
                      syncMenu(block, el.value, start);
                    }}
                    onCompositionStart={() => {
                      composing.current = true;
                    }}
                    onCompositionEnd={(event) => {
                      composing.current = false;
                      const result = commit({
                        type: "text",
                        blockId: block.id,
                        text: event.currentTarget.value,
                        caret: event.currentTarget.selectionStart,
                      });
                      if (!result.selection) {
                        syncMenu(
                          block,
                          event.currentTarget.value,
                          event.currentTarget.selectionStart
                        );
                      }
                    }}
                    onPaste={(event) => {
                      const files = Array.from(event.clipboardData.files);
                      if (
                        files.length > 0 &&
                        onPasteFilesRef.current?.(files)
                      ) {
                        event.preventDefault();
                        return;
                      }
                      const result = commit({
                        type: "paste",
                        blockId: block.id,
                        caret: event.currentTarget.selectionStart,
                        text: event.clipboardData.getData("text/plain"),
                      });
                      if (result.handled) event.preventDefault();
                    }}
                  />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {menu?.kind === "slash" && slashMatches.length > 0 ? (
        <AnchoredMenu
          anchor={anchor}
          placement={menuPlacement}
          testId="slash-menu"
          menuRef={menuNodeRef}
        >
          <div className="px-2.5 py-1 text-[11px] text-muted-foreground">
            Type to filter
          </div>
          <ul>
            {slashRows.map(({ command, index, showGroup }) => {
              const Icon = ICONS[command.id];
              const selected = index === active;
              return (
                <li key={command.id}>
                  {showGroup ? (
                    <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {command.group}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    data-menu-active={selected ? "true" : "false"}
                    data-slash-command={command.id}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left",
                      selected && "bg-accent"
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => chooseSlash(command)}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">{command.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {command.description}
                      </span>
                    </span>
                    {command.shortcut ? (
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {command.shortcut}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
            ↑↓ navigate · enter select · esc close
          </div>
        </AnchoredMenu>
      ) : null}

      {menu?.kind === "mention" && mentionMatches.length > 0 ? (
        <AnchoredMenu
          anchor={anchor}
          placement={menuPlacement}
          testId="mention-menu"
          menuRef={menuNodeRef}
        >
          <div className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Mention someone
          </div>
          <ul>
            {mentionMatches.map((member, index) => {
              const selected = index === active;
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    data-menu-active={selected ? "true" : "false"}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px]",
                      selected && "bg-accent"
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => chooseMention(member)}
                  >
                    <UserAvatar user={member} className="size-5" />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {member.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </AnchoredMenu>
      ) : null}

      {toolbarBlocks.length > 0 && highlight ? (
        <SelectionToolbar
          getRect={highlightRect}
          blockType={uniformBlockType(toolbarBlocks)}
          inlineActive={inlineActive}
          inlineDisabled={inlineDisabled}
          onTurnInto={onTurnInto}
          onInline={onInline}
        />
      ) : null}
    </div>
  );
}

function toolbarTargetBlocks(
  blocks: Block[],
  highlight: Highlight | null,
  selecting: boolean,
  menuOpen: boolean
): Block[] {
  if (!highlight || menuOpen) return [];
  // Keep the bar hidden while a text drag is still moving. A multi-block
  // highlight should show the bar as soon as the sections are chosen.
  if (selecting && highlight.mode === "text") return [];
  if (highlight.mode === "text") {
    const block = blocks.find((item) => item.id === highlight.blockId);
    return block ? [block] : [];
  }
  const idSet = new Set(highlight.ids);
  return blocks.filter((block) => idSet.has(block.id));
}

function inlineFlags(
  list: Block[],
  highlight: Highlight | null
): Partial<Record<InlineMarker, boolean>> {
  const flags: Partial<Record<InlineMarker, boolean>> = {};
  for (const marker of INLINE_MARKERS) {
    if (highlight?.mode === "text" && list.length === 1) {
      flags[marker] = rangeIsWrapped(
        list[0]!.text,
        highlight.start,
        highlight.end,
        marker
      );
    } else {
      const texts = list.filter((block) => block.type !== "divider" && block.text);
      flags[marker] =
        texts.length > 0 && texts.every((block) => blockIsWrapped(block.text, marker));
    }
  }
  return flags;
}
