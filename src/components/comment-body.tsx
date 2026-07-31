import { splitMentions } from "@/lib/mentions";
import type { Member } from "@/lib/types";

export function CommentBody({
  body,
  members,
}: {
  body: string;
  members: Member[];
}) {
  const parts = splitMentions(body, members);
  return (
    <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-foreground/90">
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
          <span key={i}>{part.value}</span>
        )
      )}
    </p>
  );
}
