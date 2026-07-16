import { useEffect, useState } from "react";
import {
  FolderSimple,
  Plus,
  SquaresFour,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import type { MenuEntry, Workspace } from "@silo-code/sdk";
import { getWorkspaceService } from "../extension-host/workspace-service";
import { getUiService } from "../extension-host/ui-service";
import { getFileService } from "../extension-host/file-service";
import { confirmWithDontShowAgain } from "../extension-host/confirm-with-dont-show-again";
import { getGlobalExtensionStorage } from "../extension-host/extension-storage";
import { deleteGroup, restoreGroup } from "../state/workspaces";
import type { ClosedGroupEntry } from "../state/partition-saved-entries";

// Suppression flags are read from the "core.workspaces" extension's own
// storage bag — the exact same one `ctx.storage.global` resolves to inside
// that extension (see `getGlobalExtensionStorage` / `context.ts`), so a
// checkbox ticked here or in the workspaces panel suppresses both.
const workspacesStorage = getGlobalExtensionStorage("core.workspaces");

// The empty-state "Open workspace" menu — the host-side twin of the workspaces
// panel's add menu (extensions-core/workspaces/workspace-add-menu.tsx). The
// CenterDock empty state is host chrome and can't import the extension's
// builder, so this mirrors it over the host service singletons (which are the
// same objects extensions reach through `ctx`). Keep the two in sync.

/**
 * Best-effort check of whether each closed workspace's folder still exists, so a
 * workspace whose folder has gone missing gets a warning. Mirrors the workspaces
 * extension's `useFolderExistence`, but over the host file service. A missing
 * entry means "don't know yet" — treat as existing until proven otherwise.
 */
export function useFolderExistence(
  folders: readonly string[],
): Map<string, boolean> {
  const [results, setResults] = useState<Map<string, boolean>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    const files = getFileService();
    const unknown = folders.filter((f) => !results.has(f));
    if (unknown.length === 0) return;
    Promise.all(
      unknown.map(async (f) => {
        try {
          return [f, await files.pathExists(f)] as const;
        } catch {
          return [f, false] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setResults((prev) => {
        const next = new Map(prev);
        for (const [f, ok] of entries) next.set(f, ok);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [folders, results]);
  return results;
}

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
  getWorkspaceService().delete(id);
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
 * Build the empty-state "Open workspace" menu rows — closed groups to restore,
 * closed workspaces to reopen (with a warning + delete control each), a
 * separator, then "New workspace…" / "New Group…". `onNew` runs the
 * new-workspace flow; `onNewGroup` the new-group flow.
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
  const workspaces = getWorkspaceService();
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
        run: () => workspaces.activate(ws.id),
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
