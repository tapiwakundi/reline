"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { CreateIssueDialog } from "@/components/create-issue-dialog";

const ShortcutsContext = createContext<{
  openCreateIssue: (statusId?: string) => void;
  openPalette: () => void;
}>({ openCreateIssue: () => {}, openPalette: () => {} });

export const useShortcuts = () => useContext(ShortcutsContext);

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export function GlobalShortcuts({ children }: { children: React.ReactNode }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [defaultStatusId, setDefaultStatusId] = useState<string | undefined>();
  const [paletteOpen, setPaletteOpen] = useState(false);

  function openCreateIssue(statusId?: string) {
    setDefaultStatusId(statusId);
    setCreateOpen(true);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        openCreateIssue();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <ShortcutsContext.Provider
      value={{
        openCreateIssue,
        openPalette: () => setPaletteOpen(true),
      }}
    >
      {children}
      <CreateIssueDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setDefaultStatusId(undefined);
        }}
        defaultStatusId={defaultStatusId}
      />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onCreateIssue={() => openCreateIssue()}
      />
    </ShortcutsContext.Provider>
  );
}
