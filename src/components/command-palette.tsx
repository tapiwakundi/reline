"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleDashedIcon,
  InboxIcon,
  KanbanSquareIcon,
  ListIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useWorkspace } from "@/lib/workspace-context";
import { wsPath } from "@/lib/workspace-slug";

type PaletteIssue = { id: string; identifier: string; title: string };

export function CommandPalette({
  open,
  onOpenChange,
  onCreateIssue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateIssue: () => void;
}) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const [issues, setIssues] = useState<PaletteIssue[]>([]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/issues", {
      headers: { "x-workspace-slug": workspace.slug },
    })
      .then((r) => r.json())
      .then((d) => setIssues(d.issues ?? []))
      .catch(() => {});
  }, [open, workspace.slug]);

  function go(path: string) {
    onOpenChange(false);
    router.push(path);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} showCloseButton={false}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              onCreateIssue();
            }}
          >
            <PlusIcon />
            Create new issue
            <span className="ml-auto text-xs text-muted-foreground">C</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go(wsPath(workspace.slug, "/inbox"))}>
            <InboxIcon /> Inbox
          </CommandItem>
          <CommandItem onSelect={() => go(wsPath(workspace.slug, "/my-issues"))}>
            <UserIcon /> My issues
          </CommandItem>
          <CommandItem onSelect={() => go(wsPath(workspace.slug, "/board"))}>
            <KanbanSquareIcon /> Board
          </CommandItem>
          <CommandItem onSelect={() => go(wsPath(workspace.slug, "/issues"))}>
            <ListIcon /> All issues
          </CommandItem>
          <CommandItem onSelect={() => go(wsPath(workspace.slug, "/backlog"))}>
            <CircleDashedIcon /> Backlog
          </CommandItem>
          <CommandItem onSelect={() => go(wsPath(workspace.slug, "/cycles"))}>
            <RefreshCwIcon /> Cycles
          </CommandItem>
          <CommandItem onSelect={() => go(wsPath(workspace.slug, "/settings"))}>
            <SettingsIcon /> Settings
          </CommandItem>
        </CommandGroup>
        {issues.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Issues">
              {issues.slice(0, 30).map((i) => (
                <CommandItem
                  key={i.id}
                  value={`${i.identifier} ${i.title}`}
                  onSelect={() =>
                    go(wsPath(workspace.slug, `/issue/${i.identifier}`))
                  }
                >
                  <span className="text-xs text-muted-foreground">
                    {i.identifier}
                  </span>
                  <span className="truncate">{i.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
