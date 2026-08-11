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

/** What a dock should do about its active panel — see {@link resolveActivationTarget}. */
export type ActivationTarget = {
  /** Panel to make active, or null to leave dockview's current pick alone. */
  targetId: string | null;
  /** True while a requested panel exists but hasn't mounted yet — keep waiting. */
  pending: boolean;
};

// Decide which panel a workspace's dock should make active — the single place
// that answers "which tab shows when this workspace becomes active", so no two
// callers can disagree about it.
//
// Precedence:
//  1. An explicit cross-workspace request (`ctx.terminals.focus()` for a
//     terminal in another workspace — see panel-activation-requests).
//  2. The panel that was active when this workspace was last visited.
//  3. Nothing — leave whatever dockview considers active.
//
// A requested panel that isn't mounted yet reports `pending` rather than
// falling through to (2): a fresh dock restores its layout and reconciles its
// terminal/editor panels in later commits, so the request arrives before the
// panel exists. Activating the remembered panel meanwhile would produce exactly
// the flip-flop this whole mechanism removes — better to leave the tab alone
// for a frame or two and switch once, when the requested panel appears.
export function resolveActivationTarget(
  requestedId: string | null,
  lastActiveId: string | null,
  hasPanel: (panelId: string) => boolean,
): ActivationTarget {
  if (requestedId) {
    return hasPanel(requestedId)
      ? { targetId: requestedId, pending: false }
      : { targetId: null, pending: true };
  }
  if (lastActiveId && hasPanel(lastActiveId)) {
    return { targetId: lastActiveId, pending: false };
  }
  return { targetId: null, pending: false };
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

// The maximize toggle only makes sense when there's an actual split.
export function shouldShowMaximizeButton(groupCount: number): boolean {
  return groupCount > 1;
}
