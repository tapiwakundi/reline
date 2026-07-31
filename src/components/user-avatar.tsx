import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Member } from "@/lib/types";

const HUES = [212, 262, 292, 152, 22, 342, 182, 62];

function hueFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export function UserAvatar({
  user,
  className,
}: {
  user: Member | null | undefined;
  className?: string;
}) {
  if (!user) {
    return (
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/50",
          className
        )}
      >
        <svg viewBox="0 0 16 16" className="size-3 text-muted-foreground" fill="currentColor">
          <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 1.5c-2.67 0-5 1.34-5 3v.75c0 .41.34.75.75.75h8.5c.41 0 .75-.34.75-.75v-.75c0-1.66-2.33-3-5-3Z" />
        </svg>
      </span>
    );
  }
  const hue = hueFor(user.id);
  return (
    <Avatar className={cn("size-5", className)}>
      {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
      <AvatarFallback
        className="text-[10px] font-medium text-white"
        style={{ background: `hsl(${hue} 45% 45%)` }}
      >
        {user.name
          .split(" ")
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase())
          .join("")}
      </AvatarFallback>
    </Avatar>
  );
}
