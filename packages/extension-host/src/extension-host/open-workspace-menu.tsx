import {
  FolderSimple,
  Plus,
  SquaresFour,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { snapshot } from "valtio";
import type { MenuEntry, Workspace } from "@silo-code/sdk";
import { store } from "../state/store";
import {
  activateWorkspace,
  deleteGroup,
  deleteWorkspace,
  pickFolderAndCreateWorkspace,
  restoreGroup,
} from "../state/workspaces";
import {
  partitionSavedEntries,
  type ClosedGroupEntry,
} from "../state/partition-saved-entries";
import { getUiService } from "./ui-service";
import { getFileService } from "./file-service";
import { confirmWithDontShowAgain } from "./confirm-with-dont-show-again";
import { getGlobalExtensionStorage } from "./extension-storage";
import { executeCommand } from "./commands";
import { reapWorkspaceTerminals } from "./terminal-service";

// The **one** builder for the "Open workspace" menu — saved groups to restore,
// closed workspaces to reopen, then New workspace… / New Group…. Three surfaces
// show it and must not drift: the Navigator header's + action, the workspace
// status-bar item, and the CenterDock empty-state CTA. It lives in the host so
// all three reach it the same way — extensions through the public
// `ctx.workspaces.getOpenWorkspaceMenuItems()`, host chrome by importing here.
//
// Deliberately imports *state* functions rather than the workspace service:
// the service exposes this menu, so depending on it here would be circular.

// Suppression flags live in the "core.workspaces" extension's own storage bag —
// the exact same one `ctx.storage.global` resolves to inside that extension
// (see `getGlobalExtensionStorage` / `context.ts`), so a "don't show again"
// ticked from any of these surfaces suppresses the dialog on all of them.
const workspacesStorage = getGlobalExtensionStorage("core.workspaces");

/** Confirm, then hard-delete a workspace (terminals are reaped by delete). */
async function confirmAndDeleteWorkspace(
  id: string,
  name: string,
): Promise<void> {
  const ok = await confirmWithDontShowAgain(getUiService(), workspacesStorage, {
    storageKey: "deleteWorkspace.dontShowAgain",
    title: "Delete workspace?",
    body: `${name} and its saved terminals will be permanently removed.`,
    confirmLabel: "Delete",
    mode: { kind: "confirm", danger: true },
  });
  if (!ok) return;
  // Same order as WorkspaceService.delete — reap first (it clears the terminal
  // records synchronously) so no PTY is orphaned in the pty-host daemon.
  void reapWorkspaceTerminals(id);
  deleteWorkspace(id);
}

/** Confirm, then delete a group. Member workspaces are kept and reappear
 * individually in Saved (deleting a group only ungroups its members). */
async function confirmAndDeleteGroup(id: string, name: string): Promise<void> {
  const ok = await confirmWithDontShowAgain(getUiService(), workspacesStorage, {
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
 * Build the "Open workspace" menu rows. `folderExistence` is a snapshot of
 * which closed workspaces' folders still exist (a missing one gets a warning);
 * a folder absent from the map means "not known yet" and is treated as
 * existing.
 */
export function buildOpenWorkspaceItems(opts: {
  closed: readonly Workspace[];
  closedGroups?: readonly ClosedGroupEntry[];
  folderExistence: Map<string, boolean>;
  onNew: () => void;
  onNewGroup?: () => void;
}): MenuEntry[] {
  const {
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
        onClick: () => void confirmAndDeleteGroup(group.id, group.name),
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
          <SquaresFour size={16} weight="duotone" />
        ),
        title: isMissing ? `Folder not found: ${ws.folder}` : ws.folder,
        run: () => activateWorkspace(ws.id),
        trailing: {
          icon: <Trash size={14} weight="regular" />,
          title: "Delete workspace permanently",
          onClick: () => void confirmAndDeleteWorkspace(ws.id, ws.name),
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

/** Best-effort existence check for each folder; a failed check counts as
 * missing, which is what the warning icon is for. */
async function checkFolders(
  folders: readonly string[],
): Promise<Map<string, boolean>> {
  const files = getFileService();
  const entries = await Promise.all(
    folders.map(async (f) => {
      try {
        return [f, await files.pathExists(f)] as const;
      } catch {
        return [f, false] as const;
      }
    }),
  );
  return new Map(entries);
}

/**
 * Resolve the full menu — backs `ctx.workspaces.getOpenWorkspaceMenuItems()`.
 * Async because it stats every closed workspace's folder before deciding which
 * rows to flag as missing.
 */
export async function resolveOpenWorkspaceMenuItems(
  closed: readonly Workspace[],
): Promise<MenuEntry[]> {
  const groups = snapshot(store).groups as Parameters<
    typeof partitionSavedEntries
  >[1];
  const saved = partitionSavedEntries(closed, groups);
  const folderExistence = await checkFolders(
    saved.workspaces.map((ws) => ws.folder),
  );
  return buildOpenWorkspaceItems({
    closed: saved.workspaces,
    closedGroups: saved.groupEntries,
    folderExistence,
    onNew: () => {
      pickFolderAndCreateWorkspace().catch((err) =>
        console.error("create workspace failed", err),
      );
    },
    onNewGroup: () => {
      executeCommand("workspace.newGroup");
    },
  });
}
