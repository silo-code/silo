import type { Workspace } from "./workspace-helpers";

// Pure partitioning logic for the "Saved" reopen menu: while a group is
// closed, its members are hidden from the individual closed-workspace list —
// only the group entry appears, and restoring it brings the members back.

export interface ClosedGroupEntry {
  id: string;
  name: string;
  memberCount: number;
  closedAt: string;
}

interface SavedGroupInput {
  name: string;
  workspaceOrder: readonly string[] | string[];
  closedAt?: string | null;
}

/**
 * Split the closed-workspace list into the individually-listed workspaces and
 * the closed-group entries, per the Saved-picker rule: a workspace that
 * belongs to a currently-closed group is omitted from the individual list
 * (whether or not it was open when the group closed) — its group is the sole
 * entry until restored.
 */
export function partitionSavedEntries(
  closed: readonly Workspace[],
  groups: Record<string, SavedGroupInput>,
): { groupEntries: ClosedGroupEntry[]; workspaces: Workspace[] } {
  const closedGroups = Object.entries(groups).filter(([, g]) => g.closedAt) as [
    string,
    SavedGroupInput & { closedAt: string },
  ][];

  const hiddenMemberIds = new Set<string>();
  for (const [, group] of closedGroups) {
    for (const wsId of group.workspaceOrder) hiddenMemberIds.add(wsId);
  }

  const groupEntries = closedGroups
    .map(([id, group]) => ({
      id,
      name: group.name,
      memberCount: group.workspaceOrder.length,
      closedAt: group.closedAt,
    }))
    .sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt));

  const workspaces = closed.filter((ws) => !hiddenMemberIds.has(ws.id));

  return { groupEntries, workspaces };
}
