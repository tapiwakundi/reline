import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/logo-mark";

export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-8 items-center justify-center rounded-md bg-[#17181b]",
        className
      )}
    >
      <LogoMark className="size-5" />
    </div>
  );
}
