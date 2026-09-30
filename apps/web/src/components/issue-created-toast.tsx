"use client";

import Link from "next/link";
import { toast } from "sonner";
import { CheckIcon, XIcon } from "lucide-react";
import { StatusIcon } from "@/components/status-icon";
import type { StatusRow } from "@/lib/types";

export function IssueCreatedToast({
  identifier,
  title,
  status,
  href,
  toastId,
}: {
  identifier: string;
  title: string;
  status: Pick<StatusRow, "type" | "color">;
  href: string;
  toastId: string | number;
}) {
  return (
    <div className="w-[min(100vw-2rem,22rem)] rounded-xl border border-border bg-popover p-4 shadow-lg ring-1 ring-foreground/10">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckIcon className="size-3" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">
            Issue created
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[13px] text-foreground/90">
            <StatusIcon status={status} className="size-3.5 shrink-0" />
            <span className="truncate">
              <span className="text-muted-foreground">{identifier}</span>
              {" – "}
              {title}
            </span>
          </div>
          <Link
            href={href}
            onClick={() => toast.dismiss(toastId)}
            className="mt-3 inline-block text-[13px] font-medium text-primary hover:underline"
          >
            View issue
          </Link>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => toast.dismiss(toastId)}
          className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function showIssueCreatedToast(input: {
  identifier: string;
  title: string;
  status: Pick<StatusRow, "type" | "color">;
  href: string;
}) {
  toast.custom(
    (id) => (
      <IssueCreatedToast
        identifier={input.identifier}
        title={input.title}
        status={input.status}
        href={input.href}
        toastId={id}
      />
    ),
    {
      duration: 6000,
      position: "bottom-right",
      unstyled: true,
      className: "pointer-events-auto",
    }
  );
}
