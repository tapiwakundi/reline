import { Skeleton } from "@/components/ui/skeleton";

function PageHeader({
  titleWidth = "w-16",
}: {
  titleWidth?: string;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
      <Skeleton className={`h-4 ${titleWidth}`} />
      <Skeleton className="h-3 w-6" />
      <div className="ml-auto flex items-center gap-2">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-7 w-20" />
      </div>
    </header>
  );
}

export function IssuesListSkeleton({ titleWidth = "w-20" }: { titleWidth?: string }) {
  return (
    <div className="flex h-full flex-col">
      <PageHeader titleWidth={titleWidth} />
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 3 }).map((_, g) => (
          <section key={g}>
            <div className="flex h-9 items-center gap-2 border-b border-border/60 bg-muted/40 px-4">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-5" />
            </div>
            {Array.from({ length: g === 0 ? 5 : 3 }).map((_, i) => (
              <div
                key={i}
                className="flex h-10 items-center gap-2.5 border-b border-border/60 px-4"
              >
                <Skeleton className="size-4" />
                <Skeleton className="h-3 w-14" />
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="h-3.5 flex-1 max-w-xs" />
                <Skeleton className="ml-auto size-5 rounded-full" />
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader titleWidth="w-14" />
      <div className="flex flex-1 gap-3 overflow-hidden p-3">
        {Array.from({ length: 4 }).map((_, col) => (
          <div
            key={col}
            className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/30"
          >
            <div className="flex h-10 items-center gap-2 px-3">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3 w-4" />
            </div>
            <div className="flex flex-col gap-2 px-2 pb-2">
              {Array.from({ length: col === 1 ? 4 : 2 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
                >
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                  <div className="mt-1 flex items-center gap-2">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="ml-auto size-5 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CyclesSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader titleWidth="w-16" />
      <div className="flex-1 space-y-1 overflow-hidden py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3">
            <div className="flex w-[4.5rem] shrink-0 flex-col items-end gap-1 pr-3 pt-1">
              <Skeleton className="size-2 rounded-full" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-14" />
              </div>
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-1.5 w-full max-w-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InboxSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="ml-auto h-7 w-28" />
      </header>
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-start gap-3 border-b border-border/60 px-4 py-3"
          >
            <Skeleton className="mt-2 size-1.5 rounded-full" />
            <Skeleton className="mt-0.5 size-6 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4 max-w-sm" />
              <Skeleton className="h-3 w-1/2 max-w-xs" />
            </div>
            <Skeleton className="h-3 w-6" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function IssueDetailSkeleton() {
  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-4">
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="size-3.5" />
          <Skeleton className="h-3.5 w-16" />
        </header>
        <div className="mx-auto w-full max-w-3xl space-y-4 px-6 py-6">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-1.5 pt-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-7 w-28" />
          </div>
          <div className="space-y-3 border-t border-border pt-6">
            <Skeleton className="h-4 w-16" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="size-5 rounded-full" />
                <Skeleton className="h-3 w-48" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <aside className="hidden w-64 shrink-0 flex-col gap-5 border-l border-border px-4 py-5 lg:flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-7 w-full" />
          </div>
        ))}
      </aside>
    </div>
  );
}

export function SettingsContentSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
