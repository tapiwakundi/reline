import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground",
        className
      )}
    >
      <svg viewBox="0 0 100 100" fill="currentColor" className="size-4">
        <path d="M1.23 61.85a2.7 2.7 0 0 1 .7-2.6l57.32-57.3a2.7 2.7 0 0 1 2.6-.71 50.1 50.1 0 0 1 12.3 5.03L6.26 74.15a50.1 50.1 0 0 1-5.03-12.3Z" />
        <path d="M11.13 81.87 81.87 11.13a50.44 50.44 0 0 1 7 7L18.13 88.87a50.44 50.44 0 0 1-7-7Z" />
        <path d="M25.85 93.74 93.74 25.85a50.1 50.1 0 0 1 5.03 12.3L38.15 98.77a2.7 2.7 0 0 1-2.6-.7 50.1 50.1 0 0 1-9.7-4.33Z" />
        <path d="M50.09 99.98 99.98 50.1c.13 4.53-.4 9.13-1.63 13.64a2.75 2.75 0 0 1-.71 1.22L63.7 98.35c-.36.36-.78.6-1.22.71-4.51 1.23-9.11 1.76-13.64 1.63l1.25-.71Z" />
      </svg>
    </div>
  );
}
