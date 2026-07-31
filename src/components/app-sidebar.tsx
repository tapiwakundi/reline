"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  InboxIcon,
  KanbanSquareIcon,
  ListIcon,
  LogOutIcon,
  PenSquareIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  TagIcon,
  UploadIcon,
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
  const [unread, setUnread] = useState(initialUnread);
  const pathname = usePathname();

  useEffect(() => {
    setUnread(initialUnread);
  }, [initialUnread, pathname]);

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch("/api/notifications/count");
        if (r.ok) {
          const d = await r.json();
          setUnread(d.count);
        }
      } catch {}
    }, 20000);
    return () => clearInterval(t);
  }, []);

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
            <div className="flex items-center gap-2 px-2 py-1.5">
              <UserAvatar user={me} className="size-6" />
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{me.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {me.email}
                </div>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <SettingsIcon /> Workspace settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings/members")}>
              <UsersIcon /> Invite teammates
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} variant="destructive">
              <LogOutIcon /> Log out
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
          <NavItem href="/cycles" icon={<RefreshCwIcon />} label="Cycles" />
        </nav>
      </div>

      <div className="mt-auto flex flex-col gap-0.5 px-3 pb-3">
        <NavItem href="/settings/labels" icon={<TagIcon />} label="Labels" />
        <NavItem href="/settings/import" icon={<UploadIcon />} label="Import" />
        <NavItem href="/settings" icon={<SettingsIcon />} label="Settings" />
      </div>
    </aside>
  );
}
