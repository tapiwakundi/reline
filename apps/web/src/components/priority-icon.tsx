import { cn } from "@/lib/utils";

/**
 * Linear-style priority glyphs: bar charts for low/medium/high, orange box
 * with ! for urgent, dashes for none.
 */
export function PriorityIcon({
  priority,
  className,
}: {
  priority: number;
  className?: string;
}) {
  const cls = cn("size-3.5 shrink-0", className);
  const gray = "#8a8f98";

  if (priority === 1) {
    return (
      <svg viewBox="0 0 14 14" className={cls} aria-hidden>
        <rect x="0.5" y="0.5" width="13" height="13" rx="3" fill="#fc7840" />
        <path
          d="M7 3.4v4.4"
          stroke="#fff"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="7" cy="10.4" r="0.95" fill="#fff" />
      </svg>
    );
  }

  const bars = (active: number) => (
    <svg viewBox="0 0 14 14" className={cls} aria-hidden>
      <rect x="1" y="8" width="3" height="5" rx="1" fill={gray} opacity={active >= 1 ? 1 : 0.35} />
      <rect x="5.5" y="5" width="3" height="8" rx="1" fill={gray} opacity={active >= 2 ? 1 : 0.35} />
      <rect x="10" y="2" width="3" height="11" rx="1" fill={gray} opacity={active >= 3 ? 1 : 0.35} />
    </svg>
  );

  switch (priority) {
    case 2:
      return bars(3);
    case 3:
      return bars(2);
    case 4:
      return bars(1);
    default:
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          <rect x="1.5" y="6.2" width="2.6" height="1.6" rx="0.8" fill={gray} opacity="0.6" />
          <rect x="5.7" y="6.2" width="2.6" height="1.6" rx="0.8" fill={gray} opacity="0.6" />
          <rect x="9.9" y="6.2" width="2.6" height="1.6" rx="0.8" fill={gray} opacity="0.6" />
        </svg>
      );
  }
}
