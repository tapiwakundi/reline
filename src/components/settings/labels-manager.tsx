"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { createLabel, deleteLabel, updateLabel } from "@/lib/actions/labels";
import { LABEL_COLORS } from "@/lib/defaults";
import { useWorkspaceSettings } from "@/lib/hooks/queries";
import { invalidateAfterLabelChange } from "@/lib/invalidate";
import type { WorkspaceSettings } from "@/lib/types";

function ColorDot({
  color,
  onPick,
}: {
  color: string;
  onPick: (c: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className="size-4 shrink-0 rounded-full ring-offset-background transition-transform hover:scale-110"
        style={{ background: color }}
        title="Change color"
      />
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-4 gap-1.5">
          {LABEL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onPick(c)}
              className={cn(
                "size-6 rounded-full transition-transform hover:scale-110",
                c === color && "ring-2 ring-ring ring-offset-2 ring-offset-popover"
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function LabelsManager({
  initialData,
}: {
  initialData: WorkspaceSettings;
}) {
  const qc = useQueryClient();
  const { data = initialData } = useWorkspaceSettings(initialData);
  const labels = data.labels;
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(LABEL_COLORS[0]);

  function add() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const created = await createLabel(newName, newColor);
      if (!created) {
        toast.error("A label with that name already exists");
        return;
      }
      setNewName("");
      await invalidateAfterLabelChange(qc);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold">Labels</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tag issues to group and filter them.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex items-center gap-2"
      >
        <ColorDot color={newColor} onPick={setNewColor} />
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New label name"
          className="h-8 max-w-56 text-sm"
        />
        <Button type="submit" size="sm" disabled={pending || !newName.trim()} className="gap-1">
          <PlusIcon className="size-3.5" />
          Add
        </Button>
      </form>

      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {labels.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No labels yet.
          </p>
        ) : (
          labels.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
              <ColorDot
                color={l.color}
                onPick={(c) =>
                  startTransition(async () => {
                    await updateLabel(l.id, l.name, c);
                    await invalidateAfterLabelChange(qc);
                  })
                }
              />
              <span className="flex-1 text-sm">{l.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  startTransition(async () => {
                    await deleteLabel(l.id);
                    await invalidateAfterLabelChange(qc);
                  })
                }
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
