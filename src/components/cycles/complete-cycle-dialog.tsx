"use client";

import { useEffect, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  completeCycle,
  type CycleIssueDisposition,
} from "@/lib/actions/cycles";
import { invalidateAfterCycleChange } from "@/lib/invalidate";
import { useWorkspace } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";
import type { CycleListItem } from "@/lib/types";

function pendingCount(cycle: CycleListItem) {
  return cycle.pending ?? Math.max(0, cycle.total - cycle.done - cycle.started);
}

const DISPOSITIONS: {
  value: CycleIssueDisposition;
  label: string;
  description: string;
}[] = [
  {
    value: "next",
    label: "Move to next cycle",
    description: "Keep status, assign the next upcoming cycle",
  },
  {
    value: "backlog",
    label: "Move to backlog",
    description: "Remove from this cycle",
  },
  {
    value: "keep",
    label: "Keep in this cycle",
    description: "Leave on the completed cycle",
  },
];

function DispositionPicker({
  label,
  count,
  value,
  onChange,
}: {
  label: string;
  count: number;
  value: CycleIssueDisposition;
  onChange: (value: CycleIssueDisposition) => void;
}) {
  if (count === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {DISPOSITIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex flex-col items-start rounded-md border px-3 py-2 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent/50"
              )}
            >
              <span className="text-[13px] font-medium">{opt.label}</span>
              <span className="text-[11px] text-muted-foreground">
                {opt.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CompleteCycleDialog({
  cycle,
  upcomingCycles,
  open,
  onOpenChange,
  onCompleted,
}: {
  cycle: CycleListItem | null;
  upcomingCycles: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}) {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [inProgressDisposition, setInProgressDisposition] =
    useState<CycleIssueDisposition>("next");
  const [pendingDisposition, setPendingDisposition] =
    useState<CycleIssueDisposition>("next");
  const [nextCycleId, setNextCycleId] = useState("");

  useEffect(() => {
    if (!open || !cycle) return;
    // Completing always tops up upcoming cycles, so "next" is always available.
    setInProgressDisposition("next");
    setPendingDisposition("next");
    setNextCycleId(upcomingCycles[0]?.id ?? "");
  }, [open, cycle, upcomingCycles]);

  function confirm() {
    if (!cycle) return;
    const needsNext =
      (cycle.started > 0 && inProgressDisposition === "next") ||
      (pendingCount(cycle) > 0 && pendingDisposition === "next");
    startTransition(async () => {
      try {
        await completeCycle(cycle.id, {
          inProgress: inProgressDisposition,
          pending: pendingDisposition,
          // Empty means server picks (or creates) the soonest upcoming cycle.
          nextCycleId: needsNext ? nextCycleId || null : null,
        });
        onOpenChange(false);
        onCompleted?.();
        toast.success(`${cycle.name} completed`);
        await invalidateAfterCycleChange(qc, workspace.id);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Couldn't complete cycle"
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete {cycle?.name}</DialogTitle>
        </DialogHeader>
        {cycle && (
          <div className="flex flex-col gap-5">
            <p className="text-[13px] text-muted-foreground">
              Done and canceled issues stay on this cycle. Choose what happens
              to unfinished work.
            </p>

            {cycle.started === 0 && pendingCount(cycle) === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No unfinished issues on this cycle.
              </p>
            ) : (
              <>
                <DispositionPicker
                  label="In progress"
                  count={cycle.started}
                  value={inProgressDisposition}
                  onChange={setInProgressDisposition}
                />
                <DispositionPicker
                  label="Pending"
                  count={pendingCount(cycle)}
                  value={pendingDisposition}
                  onChange={setPendingDisposition}
                />
                {(inProgressDisposition === "next" ||
                  pendingDisposition === "next") &&
                  upcomingCycles.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="next-cycle">Next cycle</Label>
                      <select
                        id="next-cycle"
                        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        value={nextCycleId}
                        onChange={(e) => setNextCycleId(e.target.value)}
                      >
                        {upcomingCycles.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                {(inProgressDisposition === "next" ||
                  pendingDisposition === "next") &&
                  upcomingCycles.length === 0 && (
                    <p className="text-[12px] text-muted-foreground">
                      Upcoming cycles will be created automatically when you
                      complete this one.
                    </p>
                  )}
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="button" disabled={pending} onClick={confirm}>
                Complete cycle
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
