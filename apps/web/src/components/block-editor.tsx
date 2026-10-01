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
import { UserAvatar } from "@/components/user-avatar";
import {
  detectMention,
  detectSlash,
  enumerateBlocks,
  filterSlashCommands,
  parseBlocks,
  reduceEditor,
  serializeBlocks,
  valueMatchesEditor,
  type Block,
  type EditorAction,
  type EditorSelection,
  type SlashCommand,
  type SlashCommandId,
} from "@/lib/editor-document";
import type { Member } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  placeholder = "Type / for headings, lists, and more",
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

  function commit(action: EditorAction) {
    const result = reduceEditor(blocksRef.current, action);
    if (!result.handled) return result;
    blocksRef.current = result.blocks;
    setBlocks(result.blocks);
    onChangeRef.current(serializeBlocks(result.blocks));
    if (result.selection) pendingCaret.current = result.selection;
    if (action.type !== "text" || result.selection) setMenu(null);
    return result;
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
      commit({
        type: "wrap",
        blockId: block.id,
        start: el.selectionStart,
        end: el.selectionEnd,
        marker: "**",
      });
      return;
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "i"
    ) {
      event.preventDefault();
      commit({
        type: "wrap",
        blockId: block.id,
        start: el.selectionStart,
        end: el.selectionEnd,
        marker: "*",
      });
      return;
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

    if (event.key === "Escape" && onCancelRef.current) {
      event.preventDefault();
      onCancelRef.current();
      return;
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

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("textarea, button, a, input")) return;
        event.preventDefault();
      }}
      onBlur={(event) => {
        const root = event.currentTarget;
        requestAnimationFrame(() => {
          if (root.contains(document.activeElement)) return;
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
              ref={(node) => {
                if (node) rowRefs.current.set(block.id, node);
                else rowRefs.current.delete(block.id);
              }}
              className={cn(
                index > 0 && block.type === "h1" && "mt-3",
                index > 0 && block.type === "h2" && "mt-2",
                index > 0 && block.type === "h3" && "mt-2"
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
                    className={textClass}
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
                    onKeyDown={(event) => onKeyDown(event, block)}
                    onClick={(event) =>
                      syncMenu(block, event.currentTarget.value, event.currentTarget.selectionStart)
                    }
                    onSelect={(event) => {
                      if (applyingSelection.current) return;
                      syncMenu(
                        block,
                        event.currentTarget.value,
                        event.currentTarget.selectionStart
                      );
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
    </div>
  );
}
