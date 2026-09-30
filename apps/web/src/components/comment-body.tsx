import type { Member } from "@/lib/types";
import { RichText } from "@/components/rich-text";

export function CommentBody({
  body,
  members,
}: {
  body: string;
  members: Member[];
}) {
  return (
    <RichText
      text={body}
      members={members}
      className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-foreground/90"
    />
  );
}
