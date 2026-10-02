"use client";

import { useEffect, useRef, useState } from "react";
import { FormattedText } from "@/components/formatted-text";
import {
  SelectionToolbar,
  uniformBlockType,
  unionRect,
  type InlineMarker,
} from "@/components/selection-toolbar";
import {
  blockIsWrapped,
  parseBlocks,
  reduceEditor,
  serializeBlocks,
  type BlockType,
} from "@/lib/editor-document";
import type { Member } from "@/lib/types";

const MARKERS = ["**", "*", "~~", "`"] as const;

/**
 * Read view of a ticket description. Highlighting one block or a run of them
 * opens the same type toolbar as the editor, without entering edit mode.
 */
export function ReadableDescription({
  text,
  members,
  onChange,
  onEdit,
  onToggleTodo,
}: {
  text: string;
  members: Member[];
  onChange: (next: string) => void;
  onEdit: (blockIndex: number | null) => void;
  onToggleTodo: (index: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef(0);
  const justSelected = useRef(false);
  const [indexes, setIndexes] = useState<number[] | null>(null);

  useEffect(() => {
    function onUp(event: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      const target = event.target;
      if (target instanceof Element && target.closest("[data-selection-toolbar]")) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return;
      if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return;
      const anchor = blockIndexFromNode(sel.anchorNode, root);
      const focus = blockIndexFromNode(sel.focusNode, root);
      if (anchor == null || focus == null) return;
      const [from, to] = anchor <= focus ? [anchor, focus] : [focus, anchor];
      const next: number[] = [];
      for (let index = from; index <= to; index += 1) next.push(index);
      sel.removeAllRanges();
      justSelected.current = true;
      anchorRef.current = anchor;
      setIndexes(next);
      root.focus({ preventScroll: true });
    }
    document.addEventListener("pointerup", onUp);
    return () => document.removeEventListener("pointerup", onUp);
  }, []);

  useEffect(() => {
    if (!indexes) return;
    function onDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-selection-toolbar]")) return;
      setIndexes(null);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [indexes]);

  function mutate(run: (blocks: ReturnType<typeof parseBlocks>) => ReturnType<typeof reduceEditor> | null) {
    const blocks = parseBlocks(text);
    const result = run(blocks);
    if (!result?.handled) return;
    onChange(serializeBlocks(result.blocks));
  }

  function pickedIds(blocks: ReturnType<typeof parseBlocks>) {
    if (!indexes) return [];
    return indexes
      .map((index) => blocks[index]?.id)
      .filter((id): id is string => Boolean(id));
  }

  function onTurnInto(blockType: BlockType) {
    mutate((blocks) => {
      const blockIds = pickedIds(blocks);
      if (blockIds.length === 0) return null;
      return reduceEditor(blocks, { type: "set-type", blockIds, blockType });
    });
  }

  function onInline(marker: InlineMarker) {
    mutate((blocks) => {
      const blockIds = pickedIds(blocks);
      if (blockIds.length === 0) return null;
      return reduceEditor(blocks, { type: "wrap-many", blockIds, marker });
    });
  }

  function extendTo(index: number) {
    const anchor = anchorRef.current;
    const [from, to] = anchor <= index ? [anchor, index] : [index, anchor];
    const next: number[] = [];
    for (let cursor = from; cursor <= to; cursor += 1) next.push(cursor);
    setIndexes(next);
    window.getSelection()?.removeAllRanges();
  }

  const blocks = parseBlocks(text);
  const selected = (indexes ?? [])
    .map((index) => blocks[index])
    .filter((block): block is NonNullable<typeof block> => Boolean(block));
  const inlineActive: Partial<Record<InlineMarker, boolean>> = {};
  for (const marker of MARKERS) {
    const withText = selected.filter(
      (block) => block.type !== "divider" && block.text.length > 0
    );
    inlineActive[marker] =
      withText.length > 0 && withText.every((block) => blockIsWrapped(block.text, marker));
  }
  const inlineDisabled = selected.every(
    (block) => block.type === "divider" || block.text.length === 0
  );

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      className="mt-3 block w-full cursor-text rounded-md text-left text-sm leading-6 text-foreground/90 outline-none hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-ring"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, a")) return;
        if (event.shiftKey && indexes?.length) {
          const holder = target.closest("[data-block-index]");
          const index = Number(holder?.getAttribute("data-block-index"));
          if (Number.isFinite(index)) {
            event.preventDefault();
            justSelected.current = true;
            extendTo(index);
          }
          return;
        }
      }}
      onClick={(event) => {
        if (justSelected.current) {
          justSelected.current = false;
          return;
        }
        const target = event.target as HTMLElement;
        if (target.closest("button, a")) return;
        const holder = target.closest("[data-block-index]");
        const raw = holder?.getAttribute("data-block-index");
        const index = raw == null ? null : Number(raw);
        onEdit(index != null && Number.isFinite(index) ? index : null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && indexes) {
          event.preventDefault();
          setIndexes(null);
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
          event.preventDefault();
          const count = blocks.length;
          anchorRef.current = 0;
          setIndexes(Array.from({ length: count }, (_, index) => index));
          return;
        }
        if (
          indexes &&
          (event.key === "ArrowUp" || event.key === "ArrowDown") &&
          event.shiftKey &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey
        ) {
          event.preventDefault();
          const direction = event.key === "ArrowUp" ? -1 : 1;
          const anchor = anchorRef.current;
          const low = Math.min(...indexes);
          const high = Math.max(...indexes);
          const focus = low === anchor ? high : low;
          const next = focus + direction;
          if (next < 0 || next >= blocks.length) return;
          const from = Math.min(anchor, next);
          const to = Math.max(anchor, next);
          const range: number[] = [];
          for (let index = from; index <= to; index += 1) range.push(index);
          setIndexes(range);
          return;
        }
        if (!indexes && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onEdit(null);
        }
      }}
    >
      {text.trim() ? (
        <FormattedText
          text={text}
          members={members}
          asBlocks
          selectedIndexes={indexes ?? undefined}
          onToggleTodo={onToggleTodo}
        />
      ) : (
        <span className="text-muted-foreground/50">
          Add description… Type / to format, @ to mention
        </span>
      )}
      {indexes && indexes.length > 0 ? (
        <SelectionToolbar
          getRect={() => rectForIndexes(rootRef.current, indexes)}
          blockType={uniformBlockType(selected)}
          inlineActive={inlineActive}
          inlineDisabled={inlineDisabled}
          onTurnInto={onTurnInto}
          onInline={onInline}
        />
      ) : null}
    </div>
  );
}

function blockIndexFromNode(node: Node | null, root: HTMLElement): number | null {
  const el = node instanceof Element ? node : node?.parentElement;
  if (!el || !root.contains(el)) return null;
  const holder = el.closest("[data-block-index]");
  if (!holder || !root.contains(holder)) return null;
  const value = Number(holder.getAttribute("data-block-index"));
  return Number.isFinite(value) ? value : null;
}

function rectForIndexes(root: HTMLElement | null, indexes: number[]): DOMRect | null {
  if (!root) return null;
  const rects: DOMRect[] = [];
  for (const index of indexes) {
    const el = root.querySelector<HTMLElement>(`[data-block-index="${index}"]`);
    if (el) rects.push(el.getBoundingClientRect());
  }
  return unionRect(rects);
}
