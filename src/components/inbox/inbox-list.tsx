"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheckIcon, InboxIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/actions/notifications";
import type { Member } from "@/lib/types";
import { UserAvatar } from "@/components/user-avatar";

type InboxItem = {
  id: string;
  type: string;
  payload: Record<string, string>;
  readAt: string | null;
  createdAt: string;
  issue: { identifier: string; title: string };
  actor: Member | null;
};

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function describe(n: InboxItem) {
  switch (n.type) {
    case "assigned":
      return "assigned you";
    case "commented":
      return n.payload.preview ? `commented: “${n.payload.preview}”` : "commented";
    case "status_changed":
      return n.payload.to ? `moved to ${n.payload.to}` : "changed status";
    case "mentioned":
      return n.payload.preview
        ? `mentioned you: “${n.payload.preview}”`
        : "mentioned you";
    default:
      return n.type;
  }
}

export function InboxList({ notifications }: { notifications: InboxItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const unread = notifications.filter((n) => !n.readAt).length;

  function open(n: InboxItem) {
    startTransition(async () => {
      if (!n.readAt) await markNotificationRead(n.id);
      router.push(`/issue/${n.issue.identifier}`);
      router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <h1 className="text-sm font-semibold">Inbox</h1>
        {unread > 0 && (
          <span className="text-xs text-muted-foreground">{unread} unread</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1.5 text-xs text-muted-foreground"
          disabled={pending || unread === 0}
          onClick={() =>
            startTransition(async () => {
              await markAllNotificationsRead();
              router.refresh();
            })
          }
        >
          <CheckCheckIcon className="size-3.5" />
          Mark all read
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <InboxIcon className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => open(n)}
              className={cn(
                "flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-accent/40",
                !n.readAt && "bg-primary/[0.04]"
              )}
            >
              <span
                className={cn(
                  "mt-2 size-1.5 shrink-0 rounded-full",
                  n.readAt ? "bg-transparent" : "bg-primary"
                )}
              />
              <UserAvatar user={n.actor} className="mt-0.5 size-6" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">
                  <span className="font-medium">{n.actor?.name ?? "Someone"}</span>{" "}
                  <span className="text-muted-foreground">{describe(n)}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  <span className="text-muted-foreground/70">{n.issue.identifier}</span>{" "}
                  {n.issue.title}
                </span>
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {timeAgo(n.createdAt)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
