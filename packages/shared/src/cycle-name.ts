/** Label used in default cycle names. Falls back to the workspace name. */
export function cycleNameLabel(workspace: {
  name: string;
  cycleName?: string | null;
}) {
  const custom = workspace.cycleName?.trim();
  return custom || workspace.name;
}

export function defaultCycleName(
  workspace: { name: string; cycleName?: string | null },
  number: number
) {
  return `${cycleNameLabel(workspace)} Cycle ${number}`;
}

/** Empty or identical to the workspace name means “use the workspace name”. */
export function normalizeCycleName(value: string, workspaceName: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === workspaceName) return null;
  return trimmed;
}
