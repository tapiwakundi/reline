import { splitMentions } from "@/lib/mentions";
import { splitLinks } from "@/lib/linkify";
import type { Member } from "@/lib/types";

function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, i) =>
        part.type === "link" ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {part.value}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        )
      )}
    </>
  );
}

/** Render plain text with @mentions and clickable http(s) links. */
export function RichText({
  text,
  members = [],
  className,
}: {
  text: string;
  members?: Member[];
  className?: string;
}) {
  const parts = splitMentions(text, members);
  return (
    <p className={className}>
      {parts.map((part, i) =>
        part.type === "mention" ? (
          <span
            key={i}
            className="rounded bg-primary/15 px-0.5 font-medium text-primary"
            title={part.member?.email}
          >
            {part.value}
          </span>
        ) : (
          <LinkifiedText key={i} text={part.value} />
        )
      )}
    </p>
  );
}
