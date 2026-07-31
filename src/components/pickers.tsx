"use client";

import { useState } from "react";
import { CheckIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";
import { StatusIcon } from "@/components/status-icon";
import { PriorityIcon } from "@/components/priority-icon";
import { UserAvatar } from "@/components/user-avatar";
import { PRIORITIES } from "@/lib/defaults";

const chipClass = cn(
  "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-transparent px-2 text-xs font-medium text-foreground/90 transition-colors hover:bg-accent"
);

export function StatusPicker({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (id: string) => void;
  compact?: boolean;
}) {
  const { statuses } = useWorkspace();
  const [open, setOpen] = useState(false);
  const current = statuses.find((s) => s.id === value) ?? statuses[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={chipClass}>
          <StatusIcon status={current} />
          {!compact && current.name}
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          <CommandInput placeholder="Change status…" />
          <CommandList>
            <CommandEmpty>No status found.</CommandEmpty>
            <CommandGroup>
              {statuses.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.name}
                  onSelect={() => {
                    onChange(s.id);
                    setOpen(false);
                  }}
                >
                  <StatusIcon status={s} />
                  {s.name}
                  {s.id === value && <CheckIcon className="ml-auto size-3.5" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function PriorityPicker({
  value,
  onChange,
  compact,
}: {
  value: number;
  onChange: (p: number) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={chipClass}>
          <PriorityIcon priority={value} />
          {!compact && current.label}
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          <CommandInput placeholder="Set priority…" />
          <CommandList>
            <CommandEmpty>No priority found.</CommandEmpty>
            <CommandGroup>
              {PRIORITIES.map((p) => (
                <CommandItem
                  key={p.value}
                  value={p.label}
                  onSelect={() => {
                    onChange(p.value);
                    setOpen(false);
                  }}
                >
                  <PriorityIcon priority={p.value} />
                  {p.label}
                  {p.value === value && (
                    <CheckIcon className="ml-auto size-3.5" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function AssigneePicker({
  value,
  onChange,
  compact,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  compact?: boolean;
}) {
  const { members } = useWorkspace();
  const [open, setOpen] = useState(false);
  const current = members.find((m) => m.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={chipClass}>
          <UserAvatar user={current} className="size-4" />
          {!compact && (current ? current.name : "Unassigned")}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Assign to…" />
          <CommandList>
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="unassigned"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <UserAvatar user={null} className="size-4" />
                Unassigned
                {value === null && <CheckIcon className="ml-auto size-3.5" />}
              </CommandItem>
              {members.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.name}
                  onSelect={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                >
                  <UserAvatar user={m} className="size-4" />
                  {m.name}
                  {m.id === value && <CheckIcon className="ml-auto size-3.5" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function LabelPicker({
  value,
  onChange,
  compact,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  const { labels } = useWorkspace();
  const [open, setOpen] = useState(false);
  const selected = labels.filter((l) => value.includes(l.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={chipClass}>
          {selected.length === 0 ? (
            <>
              <svg viewBox="0 0 16 16" className="size-3.5 text-muted-foreground" fill="currentColor">
                <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h4.09c.4 0 .78.16 1.06.44l5.4 5.4a1.5 1.5 0 0 1 0 2.13l-4.08 4.09a1.5 1.5 0 0 1-2.13 0l-5.4-5.4A1.5 1.5 0 0 1 2 7.58V3.5Zm3.25 3a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z" />
              </svg>
              {!compact && "Labels"}
            </>
          ) : (
            <span className="flex items-center gap-1">
              {selected.slice(0, 3).map((l) => (
                <span
                  key={l.id}
                  className="size-2.5 rounded-full"
                  style={{ background: l.color }}
                />
              ))}
              {!compact && (
                <span className="ml-0.5">
                  {selected.length === 1
                    ? selected[0].name
                    : `${selected.length} labels`}
                </span>
              )}
            </span>
          )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Add labels…" />
          <CommandList>
            <CommandEmpty>No labels. Create them in Settings.</CommandEmpty>
            <CommandGroup>
              {labels.map((l) => {
                const active = value.includes(l.id);
                return (
                  <CommandItem
                    key={l.id}
                    value={l.name}
                    onSelect={() => {
                      onChange(
                        active
                          ? value.filter((id) => id !== l.id)
                          : [...value, l.id]
                      );
                    }}
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: l.color }}
                    />
                    {l.name}
                    {active && <CheckIcon className="ml-auto size-3.5" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CyclePicker({
  value,
  onChange,
  compact,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  compact?: boolean;
}) {
  const { cycles } = useWorkspace();
  const [open, setOpen] = useState(false);
  const current = cycles.find((c) => c.id === value) ?? null;
  const selectable = cycles.filter((c) => c.status !== "completed");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={chipClass}>
          <svg viewBox="0 0 16 16" className="size-3.5 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89" strokeLinecap="round" />
            <path d="M13.5 1.5v3h-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!compact && (current ? current.name : "No cycle")}
          {current?.status === "active" && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              Active
            </Badge>
          )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Move to cycle…" />
          <CommandList>
            <CommandEmpty>No cycles. Create one first.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="no-cycle"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                No cycle
                {value === null && <CheckIcon className="ml-auto size-3.5" />}
              </CommandItem>
              {selectable.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  {c.name}
                  {c.status === "active" && (
                    <span className="text-[10px] text-primary">Active</span>
                  )}
                  {c.id === value && <CheckIcon className="ml-auto size-3.5" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
