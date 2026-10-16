"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_STATUSES,
  LABEL_COLORS,
  STATUS_NAME_MAX,
  STATUS_TYPES,
  defaultStatusColor,
  isStatusType,
  normalizeStatusName,
  statusTypeLabel,
} from "@reline/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsContentSkeleton } from "@/components/skeletons/page-skeletons";
import { StatusIcon } from "@/components/status-icon";
import {
  createStatus,
  deleteStatus,
  listStatuses,
  reorderStatuses,
  updateStatus,
} from "@/lib/api/statuses";
import { useWorkspaceSettings } from "@/lib/hooks/queries";
import { invalidateAfterColumnChange } from "@/lib/invalidate";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";
import type { StatusType, WorkspaceSettings, WorkspaceStatus } from "@/lib/types";

const COLUMN_COLORS = [
  ...new Set([
    ...DEFAULT_STATUSES.map((status) => status.color),
    ...LABEL_COLORS,
  ]),
];

function moveRows<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return items;
  next.splice(to, 0, item);
  return next;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not update columns";
}

function issueLabel(count: number) {
  return count === 1 ? "1 issue" : `${count} issues`;
}

function ColorDot({
  color,
  onPick,
}: {
  color: string;
  onPick?: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!onPick) {
    return (
      <span
        className="size-4 shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className="size-4 shrink-0 rounded-full ring-offset-background transition-transform hover:scale-110"
        style={{ background: color }}
        title="Change color"
      />
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-4 gap-1.5">
          {COLUMN_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => {
                onPick(swatch);
                setOpen(false);
              }}
              className={cn(
                "size-6 rounded-full transition-transform hover:scale-110",
                swatch.toLowerCase() === color.toLowerCase() &&
                  "ring-2 ring-ring ring-offset-2 ring-offset-popover"
              )}
              style={{ background: swatch }}
              aria-label={`Use color ${swatch}`}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TypeSelect({
  value,
  onChange,
  disabled,
}: {
  value: StatusType;
  onChange: (value: StatusType) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next && isStatusType(next)) onChange(next);
      }}
    >
      <SelectTrigger size="sm" className="h-8 w-[8.5rem] shrink-0 text-xs">
        <SelectValue>{statusTypeLabel(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {STATUS_TYPES.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NameField({
  value,
  onSave,
}: {
  value: string;
  onSave: (name: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const skipCommit = useRef(false);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  async function commit() {
    if (skipCommit.current) {
      skipCommit.current = false;
      setDraft(value);
      return;
    }
    const next = normalizeStatusName(draft);
    if (next === value) {
      setDraft(value);
      return;
    }
    try {
      await onSave(next);
    } catch {
      setDraft(value);
    }
  }

  return (
    <Input
      value={draft}
      aria-label="Column name"
      maxLength={STATUS_NAME_MAX}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        void commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          skipCommit.current = true;
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      className="h-8 min-w-0 flex-1 text-sm"
    />
  );
}

function ColumnRow({
  row,
  owner,
  canDelete,
  onSave,
  onDelete,
}: {
  row: WorkspaceStatus;
  owner: boolean;
  canDelete: boolean;
  onSave: (
    id: string,
    patch: { name?: string; type?: StatusType; color?: string }
  ) => Promise<void>;
  onDelete: (row: WorkspaceStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id, disabled: !owner });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "flex flex-wrap items-center gap-2 bg-card px-3 py-2.5",
        isDragging && "relative z-10 bg-accent/70"
      )}
      data-column-id={row.id}
    >
      {owner ? (
        <button
          type="button"
          className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-accent active:cursor-grabbing touch-none"
          aria-label={`Reorder ${row.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-3.5" />
        </button>
      ) : null}
      <ColorDot
        color={row.color}
        onPick={
          owner ? (color) => void onSave(row.id, { color }).catch(() => undefined) : undefined
        }
      />
      {owner ? (
        <NameField value={row.name} onSave={(name) => onSave(row.id, { name })} />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
      )}
      {owner ? (
        <TypeSelect
          value={row.type}
          onChange={(type) => void onSave(row.id, { type }).catch(() => undefined)}
        />
      ) : (
        <span className="w-[8.5rem] shrink-0 text-xs text-muted-foreground">
          {statusTypeLabel(row.type)}
        </span>
      )}
      <span
        className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
        title={issueLabel(row.issueCount)}
      >
        {row.issueCount}
      </span>
      {owner ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive"
          disabled={!canDelete}
          title={canDelete ? `Delete ${row.name}` : "A workspace needs at least one column"}
          aria-label={`Delete ${row.name}`}
          onClick={() => onDelete(row)}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

export function ColumnsManager({
  initialData,
}: {
  initialData: WorkspaceSettings;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { workspace } = useWorkspace();
  const { data, isPending } = useWorkspaceSettings(initialData);
  const settings = data ?? initialData;
  const owner = settings.role === "owner";
  const [rows, setRows] = useState(settings.statuses);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<StatusType>("started");
  const [newColor, setNewColor] = useState(defaultStatusColor("started"));
  const [colorTouched, setColorTouched] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<WorkspaceStatus | null>(null);
  const [moveToId, setMoveToId] = useState("");
  const revision = useRef(0);
  const tail = useRef(Promise.resolve());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const pending = pendingCount > 0;
  const deleting = pendingDelete
    ? (rows.find((row) => row.id === pendingDelete.id) ?? pendingDelete)
    : null;
  const moveTargets = deleting
    ? rows.filter((row) => row.id !== deleting.id)
    : [];
  const lastOfType = deleting
    ? rows.every((row) => row.id === deleting.id || row.type !== deleting.type)
    : false;

  function applyStatuses(next: WorkspaceStatus[]) {
    setRows(next);
    qc.setQueryData<WorkspaceSettings>(
      queryKeys.workspace.settings(workspace.id),
      (current) => (current ? { ...current, statuses: next } : current)
    );
  }

  async function refreshBoard() {
    await invalidateAfterColumnChange(qc, workspace.id);
    router.refresh();
  }

  function commit(
    optimistic:
      | WorkspaceStatus[]
      | ((current: WorkspaceStatus[]) => WorkspaceStatus[])
      | null,
    task: () => Promise<WorkspaceStatus[]>
  ) {
    const mark = ++revision.current;
    if (typeof optimistic === "function") setRows(optimistic);
    else if (optimistic) setRows(optimistic);
    const run = tail.current.catch(() => undefined).then(async () => {
      setPendingCount((count) => count + 1);
      try {
        const next = await task();
        if (mark === revision.current) applyStatuses(next);
        await refreshBoard();
      } catch (error) {
        if (mark === revision.current) {
          const fresh = await listStatuses().catch(() => null);
          if (fresh && mark === revision.current) applyStatuses(fresh);
        }
        toast.error(errorMessage(error));
        throw error;
      } finally {
        setPendingCount((count) => count - 1);
      }
    });
    tail.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  function saveRow(
    id: string,
    patch: { name?: string; type?: StatusType; color?: string }
  ) {
    return commit(
      (current) =>
        current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      () => updateStatus(id, patch)
    );
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const name = normalizeStatusName(newName);
    if (!name) return;
    setNewName("");
    try {
      await commit(null, () =>
        createStatus({ name, type: newType, color: newColor })
      );
    } catch {
      setNewName(name);
    }
  }

  function askDelete(row: WorkspaceStatus) {
    const fallback = rows.find((candidate) => candidate.id !== row.id);
    setMoveToId(fallback?.id ?? "");
    setPendingDelete(row);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const destination = deleting.issueCount > 0 ? moveToId : undefined;
    if (deleting.issueCount > 0 && !destination) {
      toast.error("Choose a column to move these issues into");
      return;
    }
    try {
      await commit(null, () => deleteStatus(deleting.id, destination));
      setPendingDelete(null);
    } catch {
      // commit already toasted and reloaded the list
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!owner || !over || active.id === over.id) return;
    const oldIndex = rows.findIndex((row) => row.id === active.id);
    const newIndex = rows.findIndex((row) => row.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = moveRows(rows, oldIndex, newIndex).map((row, position) => ({
      ...row,
      position,
    }));
    void commit(next, () => reorderStatuses(next.map((row) => row.id))).catch(
      () => undefined
    );
  }

  if (isPending && !data) return <SettingsContentSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold">Columns</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone in this workspace shares these board columns. A new workspace
          starts with Backlog, Todo, In Progress, Done, and Canceled. The
          workspace owner can add columns and drag them into any order.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Category decides how a column behaves. Backlog stays off a cycle,
          started counts as in progress, and done or canceled counts as complete.
        </p>
        {!owner ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Only the workspace owner can change columns.
          </p>
        ) : null}
      </div>

      {owner ? (
        <form onSubmit={(event) => void add(event)} className="flex flex-wrap items-center gap-2">
          <ColorDot
            color={newColor}
            onPick={(color) => {
              setColorTouched(true);
              setNewColor(color);
            }}
          />
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New column name"
            maxLength={STATUS_NAME_MAX}
            aria-label="New column name"
            className="h-8 min-w-40 flex-1 text-sm"
          />
          <TypeSelect
            value={newType}
            onChange={(type) => {
              setNewType(type);
              if (!colorTouched) setNewColor(defaultStatusColor(type));
            }}
          />
          <Button
            type="submit"
            size="sm"
            disabled={pending || !normalizeStatusName(newName)}
            className="gap-1"
          >
            <PlusIcon className="size-3.5" />
            Add
          </Button>
        </form>
      ) : null}

      <DndContext
        id="workspace-columns"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-border rounded-lg border border-border">
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No columns yet.
              </p>
            ) : (
              rows.map((row) => (
                <ColumnRow
                  key={row.id}
                  row={row}
                  owner={owner}
                  canDelete={rows.length > 1}
                  onSave={saveRow}
                  onDelete={askDelete}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (pending) return;
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}</DialogTitle>
            <DialogDescription>
              {deleting && deleting.issueCount > 0 ? (
                <>
                  {issueLabel(deleting.issueCount)} in {deleting.name} will move
                  to another column. The column is then removed for everyone in
                  the workspace.
                </>
              ) : (
                <>
                  {deleting?.name} will disappear from the board for everyone in
                  the workspace.
                </>
              )}
              {lastOfType && deleting ? (
                <>
                  {" "}
                  This is the only {statusTypeLabel(deleting.type).toLowerCase()}{" "}
                  column.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {deleting && deleting.issueCount > 0 ? (
            <Select
              value={moveToId}
              onValueChange={(next) => {
                if (next) setMoveToId(next);
              }}
            >
              <SelectTrigger className="w-full" aria-label="Move issues to">
                <SelectValue placeholder="Move issues to">
                  {moveTargets.find((row) => row.id === moveToId)?.name ??
                    "Move issues to"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {moveTargets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    <StatusIcon status={target} />
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending || (Boolean(deleting?.issueCount) && !moveToId)}
              onClick={() => void confirmDelete()}
            >
              Delete column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
