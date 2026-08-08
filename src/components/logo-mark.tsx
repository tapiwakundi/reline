import { cn } from "@/lib/utils";

/** Narrow yellow In Progress cone (30°), elongated up-right. */
export const LOGO_ACCENT = "#f2c94c";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 14 14"
      className={cn(className)}
      aria-hidden
    >
      <path d="M 5.5 9.2 L 7.7 1 L 11.5 3.2 Z" fill={LOGO_ACCENT} />
    </svg>
  );
}
