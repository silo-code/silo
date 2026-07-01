// A keyboard-navigable row in the workspaces panel: either a group header or a
// workspace. Group and workspace ids share no namespace (`grp_` vs. `ws_`), so a
// single id→index map over these is unambiguous.
export type NavItem =
  | { kind: "group"; id: string }
  | { kind: "workspace"; id: string };

interface NavGroup {
  collapsed: boolean;
  workspaceOrder: readonly string[] | string[];
}

/**
 * The flat, ordered set of rows the arrow keys rove, in the exact order they
 * paint: for each top-level panel entry, a group contributes its header followed
 * by its member workspaces (only while expanded — a collapsed group's members
 * aren't in the DOM, so they're skipped and the header stands in for them), and
 * an ungrouped entry contributes itself. `isOpen` filters out closed/stale ids
 * so the indices line up with what actually renders.
 */
export function buildNavItems(
  panelOrder: readonly string[],
  groups: Record<string, NavGroup | undefined>,
  isOpen: (id: string) => boolean,
): NavItem[] {
  const items: NavItem[] = [];
  for (const entryId of panelOrder) {
    const group = groups[entryId];
    if (group) {
      items.push({ kind: "group", id: entryId });
      if (!group.collapsed) {
        for (const wsId of group.workspaceOrder) {
          if (isOpen(wsId)) items.push({ kind: "workspace", id: wsId });
        }
      }
    } else if (isOpen(entryId)) {
      items.push({ kind: "workspace", id: entryId });
    }
  }
  return items;
}
