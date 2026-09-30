"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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
import { wsPath } from "@/lib/workspace-paths";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import type { IssueListItem } from "@/lib/types";

const MAX_ISSUE_RESULTS = 50;

const NAV_ITEMS = [
  { suffix: "/inbox", label: "Inbox", icon: InboxIcon },
  { suffix: "/my-issues", label: "My issues", icon: UserIcon },
  { suffix: "/board", label: "Board", icon: KanbanSquareIcon },
  { suffix: "/issues", label: "All issues", icon: ListIcon },
  { suffix: "/backlog", label: "Backlog", icon: CircleDashedIcon },
  { suffix: "/cycles", label: "Cycles", icon: RefreshCwIcon },
  { suffix: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function matchesQuery(haystack: string, query: string) {
  const hay = haystack.toLowerCase();
  return query.split(/\s+/).every((part) => hay.includes(part));
}

function rankIssue(issue: IssueListItem, query: string) {
  if (!query) return Date.parse(issue.updatedAt);
  const id = issue.identifier.toLowerCase();
  const title = issue.title.toLowerCase();
  const num = String(issue.number);
  if (id === query || num === query) return 1_000_000;
  if (id.endsWith(`-${query}`) || id.includes(query)) return 100_000;
  if (title.startsWith(query)) return 10_000;
  if (title.includes(query)) return 1_000;
  return 100;
}

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
  const [search, setSearch] = useState("");
  const { data: issues = [] } = useQuery({
    queryKey: queryKeys.issues.list(workspace.id),
    queryFn: async () => {
      const data = await fetchJson<{ issues: IssueListItem[] }>("/api/issues", {
        workspaceSlug: workspace.slug,
      });
      return data.issues;
    },
    enabled: open,
  });

  const query = search.trim().toLowerCase();
  const showCreate = !query || matchesQuery("create new issue", query);

  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((item) => !query || matchesQuery(item.label, query)),
    [query]
  );

  const visibleIssues = useMemo(() => {
    const matched = query
      ? issues.filter((issue) =>
          matchesQuery(
            `${issue.identifier} ${issue.title} ${issue.number}`,
            query
          )
        )
      : issues;
    return matched
      .slice()
      .sort((a, b) => rankIssue(b, query) - rankIssue(a, query))
      .slice(0, MAX_ISSUE_RESULTS);
  }, [issues, query]);

  function go(path: string) {
    onOpenChange(false);
    router.push(path);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSearch("");
      }}
      showCloseButton={false}
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Type a command or search…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {showCreate && (
          <CommandGroup heading="Actions">
            <CommandItem
              value="create-issue"
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
        )}
        {visibleNav.length > 0 && (
          <>
            {showCreate && <CommandSeparator alwaysRender />}
            <CommandGroup heading="Navigate">
              {visibleNav.map((item) => (
                <CommandItem
                  key={item.suffix}
                  value={`nav-${item.suffix}`}
                  onSelect={() => go(wsPath(workspace.slug, item.suffix))}
                >
                  <item.icon /> {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {visibleIssues.length > 0 && (
          <>
            {(showCreate || visibleNav.length > 0) && (
              <CommandSeparator alwaysRender />
            )}
            <CommandGroup heading="Issues">
              {visibleIssues.map((issue) => (
                <CommandItem
                  key={issue.id}
                  value={`issue-${issue.id}`}
                  onSelect={() =>
                    go(wsPath(workspace.slug, `/issue/${issue.identifier}`))
                  }
                >
                  <span className="text-xs text-muted-foreground">
                    {issue.identifier}
                  </span>
                  <span className="truncate">{issue.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
