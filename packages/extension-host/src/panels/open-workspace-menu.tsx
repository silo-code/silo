import { useEffect, useState } from "react";
import { Plus, SquaresFour, Trash, Warning } from "@phosphor-icons/react";
import type { MenuEntry, Workspace } from "@silo-code/sdk";
import { getWorkspaceService } from "../extension-host/workspace-service";
import { getUiService } from "../extension-host/ui-service";
import { getTerminalService } from "../extension-host/terminal-service";
import { getFileService } from "../extension-host/file-service";

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

/** Confirm, then hard-delete a workspace and tear down its terminals. */
async function confirmAndDeleteWorkspace(
  id: string,
  name: string,
): Promise<void> {
  const ok = await getUiService().confirm({
    title: "Delete workspace?",
    body: `${name} and its saved terminals will be permanently removed.`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  getTerminalService().closeWorkspace(id);
  getWorkspaceService().delete(id);
}

/**
 * Build the empty-state "Open workspace" menu rows — closed workspaces to
 * reopen (with a warning + delete control each), a separator, then
 * "New workspace…". `onNew` runs the new-workspace flow.
 */
export function buildOpenWorkspaceItems(opts: {
  closed: readonly Workspace[];
  folderExistence: Map<string, boolean>;
  onNew: () => void;
}): MenuEntry[] {
  const { closed, folderExistence, onNew } = opts;
  const workspaces = getWorkspaceService();
  const items: MenuEntry[] = [{ type: "header", label: "Saved" }];
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
  items.push({ type: "separator" });
  items.push({
    label: "New workspace…",
    icon: <Plus size={14} weight="bold" />,
    run: onNew,
  });
  return items;
}
