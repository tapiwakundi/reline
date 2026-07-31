"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  CircleDashedIcon,
  InboxIcon,
  KanbanSquareIcon,
  ListIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  PenSquareIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { useWorkspace } from "@/lib/workspace-context";
import { useUnreadCount } from "@/lib/hooks/queries";
import { useShortcuts } from "@/components/global-shortcuts";
import { UserAvatar } from "@/components/user-avatar";

function NavItem({
  href,
  icon,
  label,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={cn(
        "flex h-7 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      <span className="text-muted-foreground [&>svg]:size-4">{icon}</span>
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-auto rounded-full bg-primary/20 px-1.5 text-[11px] font-semibold text-primary">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

export function AppSidebar({ initialUnread }: { initialUnread: number }) {
  const { workspace, me } = useWorkspace();
  const { openCreateIssue, openPalette } = useShortcuts();
  const router = useRouter();
  const { data: unread = initialUnread } = useUnreadCount(initialUnread);

  async function logout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-1 px-3 pt-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-sidebar-accent">
            <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary text-[11px] font-bold text-primary-foreground">
              {workspace.name[0]?.toUpperCase()}
            </span>
            <span className="truncate text-[13px] font-semibold text-foreground">
              {workspace.name}
            </span>
            <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => router.push("/settings/members")}>
              <UsersIcon /> Invite teammates
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          onClick={() => openCreateIssue()}
          title="New issue (C)"
        >
          <PenSquareIcon className="size-4" />
        </Button>
      </div>

      <button
        onClick={openPalette}
        className="mx-3 mt-3 flex h-7 items-center gap-2 rounded-md border border-sidebar-border px-2 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent"
      >
        <SearchIcon className="size-3.5" />
        Search
        <kbd className="ml-auto rounded border border-sidebar-border px-1 font-sans text-[10px]">
          ⌘K
        </kbd>
      </button>

      <nav className="mt-4 flex flex-col gap-0.5 px-3">
        <NavItem href="/inbox" icon={<InboxIcon />} label="Inbox" badge={unread} />
        <NavItem href="/my-issues" icon={<UserIcon />} label="My issues" />
      </nav>

      <div className="mt-5 px-3">
        <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          Workspace
        </div>
        <nav className="flex flex-col gap-0.5">
          <NavItem href="/board" icon={<KanbanSquareIcon />} label="Board" />
          <NavItem href="/issues" icon={<ListIcon />} label="Issues" />
          <NavItem
            href="/backlog"
            icon={<CircleDashedIcon />}
            label="Backlog"
          />
          <NavItem href="/cycles" icon={<RefreshCwIcon />} label="Cycles" />
        </nav>
      </div>

      <div className="mt-auto border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent data-popup-open:bg-sidebar-accent">
            <UserAvatar user={me} className="size-7" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-foreground">
                {me.name}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {workspace.name}
              </div>
            </div>
            <MoreHorizontalIcon className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-56"
          >
            <div className="px-2 py-1.5">
              <div className="truncate text-sm font-medium">{me.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {me.email}
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <SettingsIcon /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings/members")}>
              <UsersIcon /> Invite teammates
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOutIcon /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
