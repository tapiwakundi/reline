"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckIcon,
  MoreHorizontalIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
  completeCycle,
  createCycle,
  deleteCycle,
  startCycle,
} from "@/lib/actions/cycles";

type CycleItem = {
  id: string;
  number: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "planned" | "active" | "completed";
  total: number;
  done: number;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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

export function CyclesView({ cycles }: { cycles: CycleItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const defaults = defaultDates();

  function create(form: FormData) {
    startTransition(async () => {
      await createCycle({
        name: String(form.get("name") ?? ""),
        startDate: String(form.get("start")),
        endDate: String(form.get("end")),
      });
      setOpen(false);
      toast.success("Cycle created");
      router.refresh();
    });
  }

  const act = (fn: () => Promise<void>, msg: string) => () =>
    startTransition(async () => {
      await fn();
      toast.success(msg);
      router.refresh();
    });

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
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
        {cycles.length === 0 ? (
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
          <div className="divide-y divide-border/60">
            {cycles.map((c) => {
              const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <Link
                    href={`/board?cycle=${c.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <RefreshCwIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-[13px] font-medium">
                      {c.name}
                    </span>
                    {c.status === "active" && (
                      <Badge className="h-4.5 bg-primary/15 px-1.5 text-[10px] text-primary hover:bg-primary/15">
                        Active
                      </Badge>
                    )}
                    {c.status === "completed" && (
                      <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px]">
                        Completed
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {fmt(c.startDate)} – {fmt(c.endDate)}
                    </span>
                  </Link>

                  <div className="flex w-40 items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">
                      {c.done}/{c.total} done
                    </span>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "icon" }),
                        "size-7 text-muted-foreground"
                      )}
                      disabled={pending}
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {c.status === "planned" && (
                        <DropdownMenuItem
                          onClick={act(() => startCycle(c.id), `${c.name} started`)}
                        >
                          <PlayIcon /> Start cycle
                        </DropdownMenuItem>
                      )}
                      {c.status === "active" && (
                        <DropdownMenuItem
                          onClick={act(
                            () => completeCycle(c.id),
                            `${c.name} completed`
                          )}
                        >
                          <CheckIcon /> Complete cycle
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={act(() => deleteCycle(c.id), `${c.name} deleted`)}
                      >
                        <Trash2Icon /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New cycle</DialogTitle>
          </DialogHeader>
          <form action={create} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cycle-name">Name</Label>
              <Input
                id="cycle-name"
                name="name"
                placeholder={`Cycle ${cycles.length + 1}`}
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
    </div>
  );
}
