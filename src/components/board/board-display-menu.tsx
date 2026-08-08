"use client";

import { useTransition } from "react";
import { SlidersHorizontalIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateBoardDisplayPrefs } from "@/lib/actions/board-display";
import {
  CARD_PROPERTY_OPTIONS,
  COLUMNS_OPTIONS,
  COMPLETED_OPTIONS,
  ORDERING_OPTIONS,
  type BoardCardProperty,
  type BoardColumnsGroup,
  type BoardCompletedWindow,
  type BoardDisplayPrefs,
  type BoardOrdering,
} from "@/lib/board-display";

function label<T extends string>(
  options: readonly { value: T; label: string }[],
  value: T
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function Row({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-8 items-center justify-between gap-3">
      <span className="text-[13px] text-muted-foreground">{title}</span>
      {children}
    </div>
  );
}

function PrefSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v != null) onChange(v as T);
      }}
    >
      <SelectTrigger
        size="sm"
        className="h-7 min-w-32 border-transparent bg-secondary/60 text-xs hover:bg-secondary dark:bg-secondary/60 dark:hover:bg-secondary"
      >
        <SelectValue>{label(options, value)}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function BoardDisplayMenu({
  prefs,
  onChange,
  iconOnly = false,
}: {
  prefs: BoardDisplayPrefs;
  onChange: (prefs: BoardDisplayPrefs) => void;
  /** Circular icon trigger (Linear-style board toolbar). */
  iconOnly?: boolean;
}) {
  const [, startTransition] = useTransition();

  function commit(patch: Partial<BoardDisplayPrefs>) {
    const next = { ...prefs, ...patch };
    onChange(next);
    startTransition(async () => {
      await updateBoardDisplayPrefs(next);
    });
  }

  function toggleProperty(prop: BoardCardProperty) {
    commit({
      properties: prefs.properties.includes(prop)
        ? prefs.properties.filter((p) => p !== prop)
        : [...prefs.properties, prop],
    });
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          iconOnly
            ? cn(
                buttonVariants({ variant: "secondary", size: "icon" }),
                "size-8 rounded-full text-muted-foreground hover:text-foreground"
              )
            : cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "h-7 gap-1.5 text-xs text-muted-foreground"
              )
        )}
        title="Display"
      >
        <SlidersHorizontalIcon className="size-3.5" />
        {!iconOnly && "Display"}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-3">
        <div className="flex flex-col gap-1">
          <Row title="Columns">
            <PrefSelect<BoardColumnsGroup>
              value={prefs.columns}
              options={COLUMNS_OPTIONS}
              onChange={(columns) => commit({ columns })}
            />
          </Row>
          <Row title="Ordering">
            <PrefSelect<BoardOrdering>
              value={prefs.ordering}
              options={ORDERING_OPTIONS}
              onChange={(ordering) => commit({ ordering })}
            />
          </Row>
          <Row title="Order completed by recency">
            <Switch
              checked={prefs.orderCompletedByRecency}
              onCheckedChange={(orderCompletedByRecency) =>
                commit({ orderCompletedByRecency })
              }
            />
          </Row>
        </div>

        <div className="-mx-3 my-2.5 h-px bg-border" />

        <Row title="Completed issues">
          <PrefSelect<BoardCompletedWindow>
            value={prefs.completed}
            options={COMPLETED_OPTIONS}
            onChange={(completed) => commit({ completed })}
          />
        </Row>

        <div className="-mx-3 my-2.5 h-px bg-border" />

        <div className="flex flex-col gap-1">
          <span className="py-1 text-[13px] font-medium">Board options</span>
          <Row title="Show backlog">
            <Switch
              checked={prefs.showBacklog}
              onCheckedChange={(showBacklog) => commit({ showBacklog })}
            />
          </Row>
          <Row title="Show empty columns">
            <Switch
              checked={prefs.showEmptyColumns}
              onCheckedChange={(showEmptyColumns) =>
                commit({ showEmptyColumns })
              }
            />
          </Row>
          <span className="py-1 text-[13px] text-muted-foreground">
            Display properties
          </span>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {CARD_PROPERTY_OPTIONS.map((opt) => {
              const active = prefs.properties.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleProperty(opt.value)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs transition-colors",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
