import {
  FolderSimple,
  Plus,
  SquaresFour,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import {
  closeGroup,
  confirmWithDontShowAgain,
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

/** Show the educational "closing keeps terminals alive" popup, then close a
 * workspace. Skipped once the user opts out via "Don't show this again". */
export async function confirmAndCloseWorkspace(
  ctx: ExtensionContext,
  id: string,
  name: string,
): Promise<void> {
  const ok = await confirmWithDontShowAgain(ctx.ui, ctx.storage.global, {
    storageKey: "closeWorkspace.dontShowAgain",
    title: "Close workspace",
    body: `Closing "${name}" keeps its terminals running in the background — reopen it anytime to pick up where you left off.`,
    confirmLabel: "Close",
    mode: { kind: "info" },
  });
  if (!ok) return;
  ctx.workspaces.close(id);
}

/** Confirm, then hard-delete a workspace (terminals are reaped by delete). */
export async function confirmAndDeleteWorkspace(
  ctx: ExtensionContext,
  id: string,
  name: string,
): Promise<void> {
  const ok = await confirmWithDontShowAgain(ctx.ui, ctx.storage.global, {
    storageKey: "deleteWorkspace.dontShowAgain",
    title: "Delete workspace?",
    body: `${name} and its saved terminals will be permanently removed.`,
    confirmLabel: "Delete",
    mode: { kind: "confirm", danger: true },
  });
  if (!ok) return;
  ctx.workspaces.delete(id);
}

/** Show the educational "closing keeps terminals alive" popup, then close a
 * group. Skipped once the user opts out via "Don't show this again". */
export async function confirmAndCloseGroup(
  ctx: ExtensionContext,
  id: string,
  name: string,
): Promise<void> {
  const ok = await confirmWithDontShowAgain(ctx.ui, ctx.storage.global, {
    storageKey: "closeGroup.dontShowAgain",
    title: "Close group",
    body: `Closing "${name}" closes all of its workspaces, but their terminals keep running in the background. Reopen the group anytime to bring them all back.`,
    confirmLabel: "Close Group",
    mode: { kind: "info" },
  });
  if (!ok) return;
  closeGroup(id);
}

/** Confirm, then delete a group. Member workspaces are kept and reappear
 * individually in Saved (deleting a group only ungroups its members). */
export async function confirmAndDeleteGroup(
  ctx: ExtensionContext,
  id: string,
  name: string,
): Promise<void> {
  const ok = await confirmWithDontShowAgain(ctx.ui, ctx.storage.global, {
    storageKey: "deleteGroup.dontShowAgain",
    title: "Delete group?",
    body: `${name} will be removed. Its workspaces stay saved and will appear individually.`,
    confirmLabel: "Delete",
    mode: { kind: "confirm", danger: true },
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
