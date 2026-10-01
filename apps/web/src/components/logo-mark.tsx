import { cn } from "@/lib/utils";

export const LOGO_ACCENT = "#ECB22E";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(className)}
      aria-hidden
    >
      <path
        fill={LOGO_ACCENT}
        d="M8.567 1.549A11 11 0 1 0 22.451 15.433Z"
      />
      <path
        fill={LOGO_ACCENT}
        d="M11.048 1.041A11 11 0 0 1 22.959 12.952Z"
      />
    </svg>
  );
}
