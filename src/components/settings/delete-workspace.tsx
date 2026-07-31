"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteWorkspace } from "@/lib/actions/workspace";

export function DeleteWorkspace({ workspaceName }: { workspaceName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [pending, startTransition] = useTransition();

  const matches = confirmName.trim() === workspaceName;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setConfirmName("");
  }

  function submit() {
    if (!matches || pending) return;
    startTransition(async () => {
      try {
        await deleteWorkspace(confirmName);
        router.replace("/onboarding");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete workspace");
      }
    });
  }

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-destructive">
              Delete workspace
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently delete this workspace and all of its issues, labels,
              cycles, and attachments. This cannot be undone.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="shrink-0"
            onClick={() => setOpen(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Delete workspace</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">{workspaceName}</span>{" "}
              and all of its data. Type the workspace name to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="confirm-workspace-name"
              className="text-xs text-muted-foreground"
            >
              Workspace name
            </label>
            <Input
              id="confirm-workspace-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={workspaceName}
              autoComplete="off"
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!matches || pending}
              onClick={submit}
            >
              {pending ? "Deleting…" : "Delete workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
