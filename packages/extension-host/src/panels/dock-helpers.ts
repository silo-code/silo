import type { DockviewApi, DockviewGroupPanel } from "dockview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { pickWorkspaceFolder } from "../extension-host/pick-folder";

export function isFilePanelId(id: string): boolean {
  // Diffs are editor records now (mode "diff"), so they share the `editor:`
  // panel-id scheme — there is no separate `diff:` kind. See ctx-domains.md →
  // "The editor surface".
  return id.startsWith("editor:");
}

// Pick which group a newly-opened file should land in. Without this, dockview
// adds new panels to whatever group is active — which, when a file is opened
// from a terminal cmd-click, is the terminal's group. We prefer the focused
// group only if it's already showing a file; otherwise fall back to any group
// that's currently showing a file, then any group that contains a file at all.
export function findEditorTargetGroup(
  api: DockviewApi,
): DockviewGroupPanel | null {
  const active = api.activeGroup;
  if (active?.activePanel && isFilePanelId(active.activePanel.id)) {
    return active;
  }
  for (const group of api.groups) {
    if (group.activePanel && isFilePanelId(group.activePanel.id)) return group;
  }
  for (const group of api.groups) {
    if (group.panels.some((p) => isFilePanelId(p.id))) return group;
  }
  return null;
}

// Given the panel that was active just before a tab closed, decide which panel
// to re-assert afterwards. Returns null when the closed tab WAS the active one
// (let dockview's within-group MRU pick the next tab); otherwise returns the
// previously-active id so the caller can keep focus there. See the call site in
// WorkspaceDock for why `api.activePanel` is the pre-close value at remove time.
export function panelToReactivateOnClose(
  removedPanelId: string,
  preCloseActivePanelId: string | null,
): string | null {
  if (!preCloseActivePanelId) return null;
  if (preCloseActivePanelId === removedPanelId) return null;
  return preCloseActivePanelId;
}

// Shared action helper — used by both the per-group + menu and the empty
// workspace watermark. Resolves the workspace folder, then opens a file picker.
export async function pickFileForWorkspace(
  wsId: string,
): Promise<string | null> {
  const folder = await pickWorkspaceFolder(wsId);
  if (!folder) return null;
  const picked = await openDialog({
    directory: false,
    multiple: false,
    defaultPath: folder,
  });
  return typeof picked === "string" ? picked : null;
}
