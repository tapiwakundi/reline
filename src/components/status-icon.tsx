import { cn } from "@/lib/utils";
import type { StatusRow } from "@/lib/types";

/**
 * Linear-style status glyphs: dashed ring (backlog), empty ring (todo),
 * partial pie (in progress), filled check (done), crossed circle (canceled).
 */
export function StatusIcon({
  status,
  className,
}: {
  status: Pick<StatusRow, "type" | "color">;
  className?: string;
}) {
  const c = status.color;
  const cls = cn("size-3.5 shrink-0", className);

  switch (status.type) {
    case "backlog":
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          <circle
            cx="7"
            cy="7"
            r="6"
            fill="none"
            stroke={c}
            strokeWidth="1.5"
            strokeDasharray="1.4 1.74"
          />
        </svg>
      );
    case "unstarted":
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          <circle cx="7" cy="7" r="6" fill="none" stroke={c} strokeWidth="1.5" />
        </svg>
      );
    case "started":
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          <circle cx="7" cy="7" r="6" fill="none" stroke={c} strokeWidth="1.5" />
          <path d="M 7 7 L 7 3.5 A 3.5 3.5 0 0 1 10.5 7 Z" fill={c} />
          <circle cx="7" cy="7" r="2" fill={c} opacity="0.4" />
        </svg>
      );
    case "done":
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          <circle cx="7" cy="7" r="7" fill={c} />
          <path
            d="M4.2 7.2 6.2 9.2 9.8 5"
            fill="none"
            stroke="#fff"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "canceled":
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          <circle cx="7" cy="7" r="7" fill={c} />
          <path
            d="M4.8 4.8 9.2 9.2 M9.2 4.8 4.8 9.2"
            stroke="#0f1011"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
