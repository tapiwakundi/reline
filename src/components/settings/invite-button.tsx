"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CopyIcon, LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInvite } from "@/lib/actions/workspace";

export function InviteButton() {
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      try {
        const { token } = await createInvite();
        const url = `${window.location.origin}/invite/${token}`;
        setLink(url);
        await navigator.clipboard.writeText(url).catch(() => {});
        toast.success("Invite link copied to clipboard");
      } catch {
        toast.error("Could not create invite");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button size="sm" onClick={generate} disabled={pending} className="gap-1.5">
        <LinkIcon className="size-3.5" />
        Create invite link
      </Button>
      {link && (
        <div className="flex w-72 items-center gap-1">
          <Input readOnly value={link} className="h-7 text-xs" />
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(link);
              toast.success("Copied");
            }}
          >
            <CopyIcon className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
