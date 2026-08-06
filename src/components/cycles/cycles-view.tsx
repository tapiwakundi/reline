"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckIcon,
  CirclePlayIcon,
  HistoryIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createCycle,
  deleteCycle,
  startCycle,
  updateCycle,
} from "@/lib/actions/cycles";
import { useQueryClient } from "@tanstack/react-query";
import { useCycles } from "@/lib/hooks/queries";
import { useWorkspace } from "@/lib/workspace-context";
import { wsPath } from "@/lib/workspace-paths";
import { invalidateAfterCycleChange } from "@/lib/invalidate";
import type { CycleListItem } from "@/lib/types";
import { CyclesSkeleton } from "@/components/skeletons/page-skeletons";
import { MobileNavButton } from "@/components/mobile-nav";
import { CompleteCycleDialog } from "@/components/cycles/complete-cycle-dialog";

type CycleItem = CycleListItem;

type ListEntry =
  | { kind: "cycle"; cycle: CycleItem }
  | { kind: "paused" };

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

function defaultDates() {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 14);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function statusLabel(status: CycleItem["status"]) {
  if (status === "active") return "Current";
  if (status === "completed") return "Completed";
  return "Upcoming";
}

function ProgressRing({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 5.5;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg viewBox="0 0 14 14" className={cn("size-3.5", className)} aria-hidden>
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-muted-foreground/35"
      />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        className="text-primary"
        transform="rotate(-90 7 7)"
      />
    </svg>
  );
}

function CycleChart({ cycle }: { cycle: CycleItem }) {
  const start = startOfDay(new Date(cycle.startDate));
  const end = startOfDay(new Date(cycle.endDate));
  const totalDays = Math.max(1, daysBetween(start, end));
  const width = 640;
  const height = 120;
  const padX = 8;
  const padY = 16;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const weekends: { x: number; w: number }[] = [];
  for (let i = 0; i <= totalDays; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) {
      const x = padX + (i / totalDays) * chartW;
      const w = chartW / totalDays;
      const last = weekends[weekends.length - 1];
      if (last && Math.abs(last.x + last.w - x) < 0.5) last.w += w;
      else weekends.push({ x, w });
    }
  }

  const progress = cycle.total ? cycle.done / cycle.total : 0;
  const remainingY = padY + progress * chartH;
  const idealEndY = padY + chartH;

  return (
    <div className="px-4 pb-4 md:pl-[4.5rem]">
      <div className="overflow-hidden rounded-lg border border-border/70 bg-card/40">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-36 w-full text-muted-foreground"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern
              id={`weekend-${cycle.id}`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="6"
                stroke="currentColor"
                strokeWidth="2"
                className="text-muted-foreground/25"
              />
            </pattern>
          </defs>

          {weekends.map((w, i) => (
            <rect
              key={i}
              x={w.x}
              y={padY}
              width={Math.max(w.w, 1)}
              height={chartH}
              fill={`url(#weekend-${cycle.id})`}
            />
          ))}

          {/* Ideal burndown */}
          <line
            x1={padX}
            y1={padY}
            x2={padX + chartW}
            y2={idealEndY}
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="3 3"
            className="text-muted-foreground/30"
          />

          {/* Remaining work (simplified from current completion) */}
          <polyline
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinecap="round"
            points={`${padX},${padY} ${padX + chartW * Math.min(1, Math.max(progress, 0.02))},${remainingY} ${padX + chartW},${remainingY}`}
          />

          <text
            x={padX}
            y={height - 2}
            className="fill-muted-foreground text-[10px]"
          >
            {fmt(cycle.startDate)}
          </text>
          <text
            x={width - padX}
            y={height - 2}
            textAnchor="end"
            className="fill-muted-foreground text-[10px]"
          >
            {fmt(cycle.endDate)}
          </text>
        </svg>

        <div className="flex flex-wrap items-center gap-5 border-t border-border/60 px-3 py-2.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-muted-foreground/50" />
            Scope
            <span className="text-foreground/80">{cycle.total}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-chart-4" />
            Started
            <span className="text-foreground/80">
              {cycle.started}
              <span className="text-muted-foreground">
                {" "}
                ·{" "}
                {cycle.total
                  ? Math.round((cycle.started / cycle.total) * 100)
                  : 0}
                %
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-primary" />
            Completed
            <span className="text-foreground/80">
              {cycle.done}
              <span className="text-muted-foreground">
                {" "}
                ·{" "}
                {cycle.total
                  ? Math.round((cycle.done / cycle.total) * 100)
                  : 0}
                %
              </span>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function CyclesView({ cycles: initialCycles }: { cycles: CycleItem[] }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { workspace } = useWorkspace();
  const { data: cycles, isPending } = useCycles(initialCycles);
  const list = cycles ?? initialCycles;
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<CycleItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [completing, setCompleting] = useState<CycleItem | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(
    () => initialCycles.find((c) => c.status === "active")?.id ?? null
  );
  const defaults = defaultDates();

  const upcomingCycles = useMemo(
    () =>
      [...list]
        .filter((c) => c.status === "planned")
        .sort(
          (a, b) =>
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        ),
    [list]
  );

  const entries = useMemo((): ListEntry[] => {
    const sorted = [...list].sort(
      (a, b) =>
        new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );
    const out: ListEntry[] = [];
    for (let i = 0; i < sorted.length; i++) {
      out.push({ kind: "cycle", cycle: sorted[i] });
      const newer = sorted[i];
      const older = sorted[i + 1];
      if (!older) continue;
      const gap = daysBetween(
        new Date(older.endDate),
        new Date(newer.startDate)
      );
      if (gap > 3) out.push({ kind: "paused" });
    }
    return out;
  }, [list]);

  function create(form: FormData) {
    startTransition(async () => {
      await createCycle({
        name: String(form.get("name") ?? ""),
        startDate: String(form.get("start")),
        endDate: String(form.get("end")),
      });
      setOpen(false);
      toast.success("Cycle created");
      await invalidateAfterCycleChange(qc, workspace.id);
    });
  }

  function openRename(cycle: CycleItem) {
    setRenaming(cycle);
    setRenameValue(cycle.name);
  }

  function rename(form: FormData) {
    if (!renaming) return;
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      toast.error("Cycle name is required");
      return;
    }
    const cycleId = renaming.id;
    startTransition(async () => {
      try {
        await updateCycle(cycleId, { name });
        setRenaming(null);
        toast.success("Cycle renamed");
        await invalidateAfterCycleChange(qc, workspace.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't rename cycle");
      }
    });
  }

  const act = (fn: () => Promise<void>, msg: string) => () =>
    startTransition(async () => {
      await fn();
      toast.success(msg);
      await invalidateAfterCycleChange(qc, workspace.id);
    });

  if (isPending && !cycles) {
    return <CyclesSkeleton />;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <MobileNavButton />
        <h1 className="text-sm font-semibold">Cycles</h1>
        <Button
          size="sm"
          className="ml-auto h-7 gap-1 text-xs"
          onClick={() => setOpen(true)}
        >
          <PlusIcon className="size-3.5" />
          New cycle
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <RefreshCwIcon className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Cycles are time-boxed sprints for your team.
            </p>
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
              Create a cycle
            </Button>
          </div>
        ) : (
          <div className="py-2">
            <div className="relative">
              {/* Continuous timeline spine */}
              <div className="pointer-events-none absolute top-0 bottom-0 left-[3.375rem] w-px bg-border" />

              {entries.map((entry, idx) => {
                if (entry.kind === "paused") {
                  return (
                    <div
                      key={`paused-${idx}`}
                      className="relative flex items-center gap-3 py-3.5"
                    >
                      <div className="flex w-[4.5rem] shrink-0 justify-end pr-[0.95rem]">
                        <span className="relative z-10 size-1.5 rounded-full bg-muted-foreground/50 ring-4 ring-background" />
                      </div>
                      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        <PauseIcon className="size-3.5" />
                        Cycles paused
                      </div>
                    </div>
                  );
                }

                const c = entry.cycle;
                const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
                const capacityPct =
                  c.estimateTotal > 0
                    ? Math.round((c.estimateDone / c.estimateTotal) * 100)
                    : pct;
                const expanded = expandedId === c.id;
                const isCurrent = c.status === "active";
                const Icon =
                  c.status === "completed" ? HistoryIcon : CirclePlayIcon;

                return (
                  <Fragment key={c.id}>
                    <div
                      className={cn(
                        "group relative flex items-stretch transition-colors",
                        expanded ? "bg-accent/25" : "hover:bg-accent/30"
                      )}
                    >
                      {/* Timeline date + node */}
                      <div className="relative flex w-[4.5rem] shrink-0 flex-col items-end pt-3.5 pr-3">
                        <span
                          className={cn(
                            "mb-1.5 text-[11px] tabular-nums",
                            isCurrent
                              ? "font-medium text-primary"
                              : "text-muted-foreground"
                          )}
                        >
                          {fmt(c.startDate)}
                        </span>
                        <span
                          className={cn(
                            "relative z-10 size-2.5 rounded-full ring-4 ring-background",
                            isCurrent
                              ? "bg-primary"
                              : "bg-muted-foreground/45"
                          )}
                        />
                        {isCurrent && (
                          <span className="pointer-events-none absolute top-[2.15rem] bottom-0 right-[1.125rem] w-px bg-primary/45" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            setExpandedId(expanded ? null : c.id)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setExpandedId(expanded ? null : c.id);
                            }
                          }}
                          className="flex cursor-pointer items-center gap-3 py-3 pr-3"
                        >
                          <Icon
                            className={cn(
                              "size-4 shrink-0",
                              isCurrent
                                ? "text-primary"
                                : "text-muted-foreground"
                            )}
                          />
                          <Link
                            href={`${wsPath(workspace.slug, "/board")}?cycle=${c.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate text-[13px] font-medium hover:text-foreground"
                          >
                            {c.name}
                          </Link>

                          <div className="ml-auto hidden items-center gap-3 text-[12px] text-muted-foreground lg:flex">
                            <span
                              className={cn(
                                isCurrent && "text-foreground/80"
                              )}
                            >
                              {statusLabel(c.status)}
                            </span>
                            {c.status === "completed" ? (
                              <>
                                <ProgressRing value={pct} />
                                <span className="tabular-nums">
                                  {pct}% success
                                </span>
                                <span className="tabular-nums">
                                  {c.done} completed
                                </span>
                                <span className="tabular-nums">
                                  {c.total} scope
                                </span>
                              </>
                            ) : (
                              <>
                                <ProgressRing value={capacityPct} />
                                <span className="tabular-nums">
                                  {capacityPct}% of capacity
                                </span>
                                <span className="tabular-nums">
                                  {c.total} scope
                                </span>
                              </>
                            )}
                          </div>

                          <div className="ml-auto flex items-center gap-2 lg:hidden">
                            <span className="text-[12px] text-muted-foreground">
                              {statusLabel(c.status)}
                            </span>
                            <ProgressRing
                              value={c.status === "completed" ? pct : capacityPct}
                            />
                            <span className="text-[12px] tabular-nums text-muted-foreground">
                              {c.status === "completed" ? pct : capacityPct}%
                            </span>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className={cn(
                                buttonVariants({
                                  variant: "ghost",
                                  size: "icon",
                                }),
                                "size-7 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 data-popup-open:opacity-100 max-md:opacity-100"
                              )}
                              disabled={pending}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontalIcon className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRename(c);
                                }}
                              >
                                <PencilIcon /> Rename
                              </DropdownMenuItem>
                              {c.status === "planned" && (
                                <DropdownMenuItem
                                  onClick={act(
                                    () => startCycle(c.id),
                                    `${c.name} started`
                                  )}
                                >
                                  <PlayIcon /> Start cycle
                                </DropdownMenuItem>
                              )}
                              {c.status === "active" && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCompleting(c);
                                  }}
                                >
                                  <CheckIcon /> Complete cycle
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() =>
                                  router.push(
                                    `${wsPath(workspace.slug, "/board")}?cycle=${c.id}`
                                  )
                                }
                              >
                                <CirclePlayIcon /> Open on board
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={act(
                                  () => deleteCycle(c.id),
                                  `${c.name} deleted`
                                )}
                              >
                                <Trash2Icon /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {expanded && <CycleChart cycle={c} />}
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New cycle</DialogTitle>
          </DialogHeader>
          <form action={create} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cycle-name">Name</Label>
              <Input
                id="cycle-name"
                name="name"
                placeholder={`Cycle ${list.length + 1}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cycle-start">Start</Label>
                <Input
                  id="cycle-start"
                  name="start"
                  type="date"
                  required
                  defaultValue={defaults.start}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cycle-end">End</Label>
                <Input
                  id="cycle-end"
                  name="end"
                  type="date"
                  required
                  defaultValue={defaults.end}
                />
              </div>
            </div>
            <Button type="submit" disabled={pending}>
              Create cycle
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renaming}
        onOpenChange={(next) => {
          if (!next) setRenaming(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename cycle</DialogTitle>
          </DialogHeader>
          <form action={rename} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rename-cycle-name">Name</Label>
              <Input
                id="rename-cycle-name"
                name="name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
                required
              />
            </div>
            <Button type="submit" disabled={pending || !renameValue.trim()}>
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <CompleteCycleDialog
        cycle={completing}
        upcomingCycles={upcomingCycles}
        open={!!completing}
        onOpenChange={(next) => {
          if (!next) setCompleting(null);
        }}
      />
    </div>
  );
}
