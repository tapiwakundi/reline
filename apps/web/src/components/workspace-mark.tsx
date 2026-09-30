import { cn } from "@/lib/utils";

export function WorkspaceMark({
  name,
  logo,
  className,
}: {
  name: string;
  logo?: string | null;
  className?: string;
}) {
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        className={cn("size-5 shrink-0 rounded object-cover", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded bg-primary text-[11px] font-medium text-primary-foreground",
        className
      )}
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}
