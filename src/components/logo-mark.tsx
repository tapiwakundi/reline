import { cn } from "@/lib/utils";

/** Yellow “In Progress” status glyph — partial pie on a ring. */
export const LOGO_ACCENT = "#f2c94c";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 14 14"
      className={cn(className)}
      aria-hidden
    >
      <circle
        cx="7"
        cy="7"
        r="6"
        fill="none"
        stroke={LOGO_ACCENT}
        strokeWidth="1.5"
      />
      <path d="M 7 7 L 7 3.5 A 3.5 3.5 0 0 1 10.5 7 Z" fill={LOGO_ACCENT} />
      <circle cx="7" cy="7" r="2" fill={LOGO_ACCENT} opacity="0.4" />
    </svg>
  );
}
