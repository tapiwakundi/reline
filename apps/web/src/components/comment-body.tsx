import type { Member } from "@/lib/types";
import { FormattedText } from "@/components/formatted-text";

export function CommentBody({
  body,
  members,
}: {
  body: string;
  members: Member[];
}) {
  return (
    <FormattedText
      text={body}
      members={members}
      className="mt-2 text-[13px] leading-6 text-foreground/90"
    />
  );
}
