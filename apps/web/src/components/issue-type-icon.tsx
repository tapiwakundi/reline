import { cn } from "@/lib/utils";
import type { IssueType } from "@/lib/types";

/**
 * Linear-style issue type glyphs: bookmark (story), checkbox (task),
 * octagon bug mark (bug).
 */
export function TypeIcon({
  type,
  className,
}: {
  type: IssueType;
  className?: string;
}) {
  const cls = cn("size-3.5 shrink-0", className);

  switch (type) {
    case "story":
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          <path
            d="M3 1.75h6.5a1.5 1.5 0 0 1 1.5 1.5v8.4L7 9.6l-4 2.05V3.25A1.5 1.5 0 0 1 4.5 1.75H3z"
            fill="#65ba74"
          />
        </svg>
      );
    case "bug":
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          <path
            d="M7 1.2 12.2 4v6L7 12.8 1.8 10V4L7 1.2Z"
            fill="#eb5757"
          />
          <path
            d="M7 4.2v5.6M4.8 5.6h4.4M4.8 8.4h4.4"
            stroke="#fff"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-hidden>
          <rect x="1.5" y="1.5" width="11" height="11" rx="2.5" fill="#5e6ad2" />
          <path
            d="M4.2 7.1 6.1 9l3.7-4"
            fill="none"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}
