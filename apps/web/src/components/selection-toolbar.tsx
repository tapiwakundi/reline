"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BoldIcon,
  CheckIcon,
  ChevronDownIcon,
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
import {
  SLASH_COMMANDS,
  type BlockType,
  type SlashCommand,
} from "@/lib/editor-document";
import { cn } from "@/lib/utils";

const TYPE_COMMANDS = [
  ...SLASH_COMMANDS.filter(
    (command): command is SlashCommand & { blockType: BlockType } =>
      command.group === "Turn into" && Boolean(command.blockType)
  ),
  ...SLASH_COMMANDS.filter(
    (command): command is SlashCommand & { blockType: BlockType } =>
      command.group === "Lists" && Boolean(command.blockType)
  ),
];

const ICONS: Partial<Record<(typeof TYPE_COMMANDS)[number]["id"], typeof TypeIcon>> = {
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
};

const INLINE = [
  { marker: "**", label: "Bold", icon: BoldIcon },
  { marker: "*", label: "Italic", icon: ItalicIcon },
  { marker: "~~", label: "Strikethrough", icon: StrikethroughIcon },
  { marker: "`", label: "Code", icon: CodeIcon },
] as const;

export type InlineMarker = (typeof INLINE)[number]["marker"];

export function uniformBlockType(blocks: { type: BlockType }[]): BlockType | null {
  if (blocks.length === 0) return null;
  const type = blocks[0]!.type;
  return blocks.every((block) => block.type === type) ? type : null;
}

export function unionRect(rects: DOMRect[]): DOMRect | null {
  if (rects.length === 0) return null;
  const top = Math.min(...rects.map((rect) => rect.top));
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

/** Box of the highlighted slice inside a textarea, in viewport coordinates. */
export function measureTextareaSelection(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number
): DOMRect {
  const host = textarea.getBoundingClientRect();
  const style = getComputedStyle(textarea);
  const mirror = document.createElement("div");
  mirror.style.position = "fixed";
  mirror.style.left = `${host.left}px`;
  mirror.style.top = `${host.top}px`;
  mirror.style.width = `${host.width}px`;
  mirror.style.height = `${host.height}px`;
  mirror.style.overflow = "hidden";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.wordBreak = "break-word";
  const copied = [
    "font",
    "fontSize",
    "fontFamily",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
    "lineHeight",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "boxSizing",
    "textAlign",
    "textTransform",
    "textIndent",
  ] as const;
  for (const prop of copied) mirror.style[prop] = style[prop];

  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const span = document.createElement("span");
  span.textContent = textarea.value.slice(from, to) || "\u200b";
  mirror.append(document.createTextNode(textarea.value.slice(0, from)), span);
  document.body.appendChild(mirror);
  const measured = span.getBoundingClientRect();
  mirror.remove();
  if (measured.width === 0 && measured.height === 0) return host;
  return measured;
}

function placeToolbar(anchor: DOMRect, width: number, height: number) {
  const gap = 8;
  let top = anchor.top - height - gap;
  if (top < 8) top = Math.min(anchor.bottom + gap, window.innerHeight - height - 8);
  const left = Math.max(
    8,
    Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 8)
  );
  return { top: Math.round(top), left: Math.round(left) };
}

export function SelectionToolbar({
  getRect,
  blockType,
  inlineActive,
  inlineDisabled = false,
  onTurnInto,
  onInline,
}: {
  getRect: () => DOMRect | null;
  blockType: BlockType | null;
  inlineActive: Partial<Record<InlineMarker, boolean>>;
  inlineDisabled?: boolean;
  onTurnInto: (type: BlockType) => void;
  onInline: (marker: InlineMarker) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [menuUp, setMenuUp] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const getRectRef = useRef(getRect);
  getRectRef.current = getRect;

  useLayoutEffect(() => {
    function update() {
      const anchor = getRectRef.current();
      const bar = barRef.current;
      if (!anchor || !bar) {
        setBox(null);
        return;
      }
      const next = placeToolbar(anchor, bar.offsetWidth, bar.offsetHeight);
      setBox((current) =>
        current && current.top === next.top && current.left === next.left ? current : next
      );
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  });

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setMenuUp(spaceBelow < 280 && rect.top > spaceBelow);
  }, [open, box]);

  useEffect(() => {
    if (!open) return;
    const current = TYPE_COMMANDS.findIndex((command) => command.blockType === blockType);
    setActiveIndex(current >= 0 ? current : 0);
  }, [open, blockType]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((index) => (index + delta + TYPE_COMMANDS.length) % TYPE_COMMANDS.length);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const command = TYPE_COMMANDS[activeIndex];
        if (!command) return;
        setOpen(false);
        onTurnInto(command.blockType);
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, activeIndex, onTurnInto]);

  useEffect(() => {
    if (!open) return;
    const root = barRef.current?.querySelector<HTMLElement>("[data-turn-into-menu]");
    const item = root?.querySelector<HTMLElement>("[data-menu-active='true']");
    if (!root || !item) return;
    const itemRect = item.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    if (itemRect.bottom > rootRect.bottom) {
      root.scrollTop += itemRect.bottom - rootRect.bottom;
    } else if (itemRect.top < rootRect.top) {
      root.scrollTop -= rootRect.top - itemRect.top;
    }
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-turn-into-menu], [data-turn-into-button]")) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const current = TYPE_COMMANDS.find((command) => command.blockType === blockType);
  const CurrentIcon = current ? (ICONS[current.id] ?? null) : null;
  const label = current?.label ?? "Turn into";

  return createPortal(
    <div
      ref={barRef}
      data-selection-toolbar
      data-testid="selection-toolbar"
      role="toolbar"
      aria-label="Formatting"
      style={{
        position: "fixed",
        zIndex: 90,
        top: box?.top ?? -9999,
        left: box?.left ?? 0,
        visibility: box ? "visible" : "hidden",
      }}
      className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          data-turn-into-button
          data-testid="selection-turn-into"
          aria-haspopup="menu"
          aria-expanded={open}
          title="Turn into"
          className={cn(
            "flex h-7 items-center gap-1 rounded-md px-2 text-[13px] font-medium hover:bg-muted",
            open && "bg-muted"
          )}
          onClick={() => setOpen((value) => !value)}
        >
          {CurrentIcon ? <CurrentIcon className="size-3.5 text-muted-foreground" /> : null}
          <span>{label}</span>
          <ChevronDownIcon className="size-3 text-muted-foreground" />
        </button>
        {open ? (
          <div
            data-turn-into-menu
            data-testid="selection-type-menu"
            role="menu"
            className={cn(
              "absolute left-0 z-10 max-h-80 w-56 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg",
              menuUp ? "bottom-full mb-1" : "top-full mt-1"
            )}
          >
            <TypeMenu
              activeIndex={activeIndex}
              blockType={blockType}
              onHover={setActiveIndex}
              onSelect={(type) => {
                setOpen(false);
                onTurnInto(type);
              }}
            />
          </div>
        ) : null}
      </div>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
      {INLINE.map((item) => {
        const Icon = item.icon;
        const pressed = Boolean(inlineActive[item.marker]);
        return (
          <button
            key={item.marker}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-pressed={pressed}
            disabled={inlineDisabled}
            data-testid={`selection-inline-${item.label.toLowerCase()}`}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
              pressed && "bg-muted text-foreground"
            )}
            onClick={() => onInline(item.marker)}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>,
    document.body
  );
}

function TypeMenu({
  activeIndex,
  blockType,
  onHover,
  onSelect,
}: {
  activeIndex: number;
  blockType: BlockType | null;
  onHover: (index: number) => void;
  onSelect: (type: BlockType) => void;
}) {
  const rows: ReactNode[] = [];
  TYPE_COMMANDS.forEach((command, index) => {
    const showGroup = index === 0 || command.group !== TYPE_COMMANDS[index - 1]!.group;
    const Icon = ICONS[command.id] ?? TypeIcon;
    const selected = command.blockType === blockType;
    const hovered = index === activeIndex;
    if (showGroup) {
      rows.push(
        <div
          key={`${index}-${command.group}`}
          className="px-2.5 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {command.group}
        </div>
      );
    }
    rows.push(
      <button
        key={command.id}
        type="button"
        role="menuitem"
        data-menu-active={hovered ? "true" : "false"}
        data-testid={`selection-type-${command.id}`}
        className={cn(
          "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px]",
          hovered && "bg-accent"
        )}
        onMouseEnter={() => onHover(index)}
        onClick={() => onSelect(command.blockType)}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 font-medium">{command.label}</span>
        {selected ? <CheckIcon className="size-3.5 text-muted-foreground" /> : null}
      </button>
    );
  });
  return <>{rows}</>;
}
