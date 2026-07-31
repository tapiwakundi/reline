"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { LabelRow, WorkspaceData } from "@/lib/types";

type WorkspaceContextValue = WorkspaceData & {
  addLabel: (label: LabelRow) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  value,
  children,
}: {
  value: WorkspaceData;
  children: React.ReactNode;
}) {
  const [labels, setLabels] = useState(value.labels);

  useEffect(() => {
    setLabels(value.labels);
  }, [value.labels]);

  const addLabel = useCallback((label: LabelRow) => {
    setLabels((prev) => {
      if (prev.some((l) => l.id === label.id)) return prev;
      return [...prev, label].sort((a, b) => a.name.localeCompare(b.name));
    });
  }, []);

  const ctx = useMemo(
    () => ({ ...value, labels, addLabel }),
    [value, labels, addLabel]
  );

  return (
    <WorkspaceContext.Provider value={ctx}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
