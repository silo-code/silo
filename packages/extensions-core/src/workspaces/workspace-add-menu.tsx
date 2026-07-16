import {
  FolderSimple,
  Plus,
  SquaresFour,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import {
  deleteGroup,
  restoreGroup,
  type ClosedGroupEntry,
} from "@silo-code/extension-host/internal";
import type { ExtensionContext, MenuEntry } from "@silo-code/sdk";
import type { Workspace } from "./workspace-helpers";

// The "Add workspace" menu rows — closed workspaces to reopen, a separator, then
// "New workspace…". Shared by the workspaces panel's add button (a standalone
// dropdown) and the status-bar workspace menu's cascading submenu, so the two
// stay identical. Built at open time from a folder-existence snapshot the caller
// supplies (it owns the `useFolderExistence` hook).

const WorkspaceIcon = SquaresFour;

/** Confirm, then hard-delete a workspace (terminals are reaped by delete). */
export async function confirmAndDeleteWorkspace(
  ctx: ExtensionContext,
  id: string,
  name: string,
): Promise<void> {
  const ok = await ctx.ui.confirm({
    title: "Delete workspace?",
    body: `${name} and its saved terminals will be permanently removed.`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  ctx.workspaces.delete(id);
}

/** Confirm, then delete a closed group. Member workspaces are kept and reappear
 * individually in Saved (deleting a group only ungroups its members). */
export async function confirmAndDeleteGroup(
  ctx: ExtensionContext,
  id: string,
  name: string,
): Promise<void> {
  const ok = await ctx.ui.confirm({
    title: "Delete group?",
    body: `${name} will be removed. Its workspaces stay saved and will appear individually.`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  deleteGroup(id);
}

/**
 * Build the "Add workspace" menu entries. `closed` is the closed-workspace list
 * (already filtered to exclude members of a closed group — see
 * `partitionSavedEntries`), `closedGroups` the closed-group entries shown above
 * them, `folderExistence` the result of `useFolderExistence` over the closed
 * workspaces' folders (a missing folder gets a warning icon), and `onNew` runs
 * the new-workspace flow.
 */
export function buildAddWorkspaceItems(opts: {
  ctx: ExtensionContext;
  closed: readonly Workspace[];
  closedGroups?: readonly ClosedGroupEntry[];
  folderExistence: Map<string, boolean>;
  onNew: () => void;
  onNewGroup?: () => void;
}): MenuEntry[] {
  const {
    ctx,
    closed,
    closedGroups = [],
    folderExistence,
    onNew,
    onNewGroup,
  } = opts;
  const items: MenuEntry[] = [{ type: "header", label: "Saved" }];
  for (const group of closedGroups) {
    items.push({
      label: group.name,
      icon: <FolderSimple size={16} weight="duotone" />,
      title: `${group.memberCount} workspace${group.memberCount === 1 ? "" : "s"}`,
      run: () => restoreGroup(group.id),
      trailing: {
        icon: <Trash size={14} weight="regular" />,
        title: "Delete group permanently",
        onClick: () => void confirmAndDeleteGroup(ctx, group.id, group.name),
      },
    });
  }
  if (closed.length > 0) {
    for (const ws of closed) {
      const missing = folderExistence.get(ws.folder) === false;
      const closedFor = ws.closedAt ? Date.now() - Date.parse(ws.closedAt) : 0;
      const isMissing = missing && closedFor > 3000;
      items.push({
        label: ws.name,
        icon: isMissing ? (
          <Warning size={16} weight="fill" />
        ) : (
          <WorkspaceIcon size={16} weight="duotone" />
        ),
        title: isMissing ? `Folder not found: ${ws.folder}` : ws.folder,
        run: () => ctx.workspaces.activate(ws.id),
        trailing: {
          icon: <Trash size={14} weight="regular" />,
          title: "Delete workspace permanently",
          onClick: () => void confirmAndDeleteWorkspace(ctx, ws.id, ws.name),
        },
      });
    }
  } else if (closedGroups.length === 0) {
    items.push({
      label: "No existing workspaces",
      disabled: true,
      run: () => {},
    });
  }
  items.push({ type: "separator" });
  items.push({
    label: "New workspace…",
    icon: <Plus size={14} weight="bold" />,
    run: onNew,
  });
  if (onNewGroup) {
    items.push({
      label: "New Group…",
      icon: <FolderSimple size={14} weight="bold" />,
      run: onNewGroup,
    });
  }
  return items;
}
