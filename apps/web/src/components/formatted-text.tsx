"use client";

import { CheckIcon } from "lucide-react";
import { RichText } from "@/components/rich-text";
import { splitLinks } from "@/lib/linkify";
import { splitMentions } from "@/lib/mentions";
import {
  enumerateBlocks,
  isPlainDocument,
  parseBlocks,
  parseInline,
  type Block,
  type InlineNode,
} from "@/lib/editor-document";
import type { Member } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TodoCheckbox({
  checked,
  onToggle,
  className,
}: {
  checked: boolean;
  onToggle?: () => void;
  className?: string;
}) {
  const box = (
    <span
      className={cn(
        "mt-1 flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input text-primary-foreground",
        checked && "border-primary bg-primary",
        className
      )}
    >
      {checked ? <CheckIcon className="size-3" /> : null}
    </span>
  );
  if (!onToggle) return box;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? "Mark as not done" : "Mark as done"}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className="shrink-0"
    >
      {box}
    </button>
  );
}

function TextLeaves({ text, members }: { text: string; members: Member[] }) {
  const parts = splitMentions(text, members);
  return parts.map((part, index) => {
    if (part.type === "mention") {
      return (
        <span
          key={index}
          className="rounded bg-primary/15 px-0.5 font-medium text-primary"
          title={part.member?.email}
        >
          {part.value}
        </span>
      );
    }
    return splitLinks(part.value).map((leaf, leafIndex) =>
      leaf.type === "link" ? (
        <a
          key={`${index}-${leafIndex}`}
          href={leaf.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {leaf.value}
        </a>
      ) : (
        <span key={`${index}-${leafIndex}`}>{leaf.value}</span>
      )
    );
  });
}

function InlineNodes({
  nodes,
  members,
}: {
  nodes: InlineNode[];
  members: Member[];
}) {
  return nodes.map((node, index) => {
    if (node.type === "text") {
      return <TextLeaves key={index} text={node.value} members={members} />;
    }
    if (node.type === "bold") {
      return (
        <strong key={index} className="font-semibold">
          <InlineNodes nodes={node.children} members={members} />
        </strong>
      );
    }
    if (node.type === "italic") {
      return (
        <em key={index}>
          <InlineNodes nodes={node.children} members={members} />
        </em>
      );
    }
    if (node.type === "strike") {
      return (
        <s key={index}>
          <InlineNodes nodes={node.children} members={members} />
        </s>
      );
    }
    if (node.type === "code") {
      return (
        <code
          key={index}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
        >
          {node.value}
        </code>
      );
    }
    if (node.type === "link") {
      return (
        <a
          key={index}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          <InlineNodes nodes={node.children} members={members} />
        </a>
      );
    }
    return null;
  });
}

export function InlineText({
  text,
  members,
}: {
  text: string;
  members: Member[];
}) {
  const nodes = parseInline(text);
  if (nodes.length === 0) return null;
  return <InlineNodes nodes={nodes} members={members} />;
}

function BlockView({
  block,
  number,
  members,
  todoIndex,
  onToggleTodo,
}: {
  block: Block;
  number: number;
  members: Member[];
  todoIndex: number;
  onToggleTodo?: (index: number) => void;
}) {
  const inline = <InlineText text={block.text} members={members} />;

  switch (block.type) {
    case "h1":
      return (
        <h2 className="mt-4 text-xl font-semibold leading-snug first:mt-0">{inline}</h2>
      );
    case "h2":
      return (
        <h3 className="mt-3 text-lg font-semibold leading-snug first:mt-0">{inline}</h3>
      );
    case "h3":
      return (
        <h4 className="mt-3 text-base font-semibold leading-snug first:mt-0">{inline}</h4>
      );
    case "bullet":
      return (
        <div className="flex items-start gap-2">
          <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-foreground/80" />
          <div className="min-w-0 flex-1 whitespace-pre-wrap">{inline}</div>
        </div>
      );
    case "numbered":
      return (
        <div className="flex items-start gap-2">
          <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">
            {number}.
          </span>
          <div className="min-w-0 flex-1 whitespace-pre-wrap">{inline}</div>
        </div>
      );
    case "todo":
      return (
        <div className="flex items-start gap-2">
          <TodoCheckbox
            checked={block.checked}
            onToggle={
              onToggleTodo ? () => onToggleTodo(todoIndex) : undefined
            }
          />
          <div
            className={cn(
              "min-w-0 flex-1 whitespace-pre-wrap",
              block.checked && "text-muted-foreground line-through"
            )}
          >
            {inline}
          </div>
        </div>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-border pl-3 text-foreground/80 whitespace-pre-wrap">
          {inline}
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-[13px] leading-6 whitespace-pre">
          {block.language ? (
            <span className="mb-1 block text-[11px] text-muted-foreground">
              {block.language}
            </span>
          ) : null}
          {block.text || " "}
        </pre>
      );
    case "divider":
      return <hr className="my-3 border-border" />;
    case "paragraph":
      return (
        <div className="min-h-6 whitespace-pre-wrap break-words">
          {block.text ? inline : "\u00a0"}
        </div>
      );
  }
}

/** Renders stored markdown. Plain text keeps the previous mention/link layout. */
export function FormattedText({
  text,
  members = [],
  className,
  onToggleTodo,
}: {
  text: string;
  members?: Member[];
  className?: string;
  onToggleTodo?: (index: number) => void;
}) {
  if (isPlainDocument(text)) {
    return (
      <RichText
        text={text}
        members={members}
        className={cn("whitespace-pre-wrap", className)}
      />
    );
  }

  const blocks = enumerateBlocks(parseBlocks(text));

  return (
    <div className={cn("flex flex-col", className)}>
      {blocks.map(({ block, number, todoIndex }, index) => (
        <div key={index} data-block-index={index}>
          <BlockView
            block={block}
            number={number}
            members={members}
            todoIndex={todoIndex}
            onToggleTodo={onToggleTodo}
          />
        </div>
      ))}
    </div>
  );
}
