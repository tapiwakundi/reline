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
        fillRule="evenodd"
        d="M12 1a11 11 0 1 1 0 22 11 11 0 0 1 0-22Zm-3.482-2.489 16.971 16.971-1.495 1.495L7.023.006Z"
      />
    </svg>
  );
}
