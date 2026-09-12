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

/**
 * The params a restored **recorded panel** should be re-seeded with, or `null`
 * when what it already has is right.
 *
 * A recorded panel comes back two ways. If its group survived, `fromJSON`
 * recreates it from the **layout** snapshot — carrying the params dockview
 * happened to have when that snapshot was taken. If it did not, `WorkspaceDock`
 * re-adds it from `DockPanelRecord.state`. Only the second is current: the
 * record is the source of truth for a panel's restore state (`dockLayout` keeps
 * its *geometry*), and it is written on every parameters change while the
 * layout is snapshotted on a debounce.
 *
 * Left alone, the stale copy doesn't merely show for a moment — it *wins*: the
 * panel's next partial `updateParameters` merges onto the stale params and the
 * result replaces the record, silently dropping whatever the record knew and
 * the layout didn't. That is how a Chat panel's persisted `title` disappeared
 * after a restart (RFC 0042, 2026-09-10), taking the next restore's early
 * title with it.
 */
export function recordedPanelParamsToRestore(
  recordState: Readonly<Record<string, unknown>>,
  panelParams: Readonly<Record<string, unknown>>,
): Record<string, unknown> | null {
  return sameParams(recordState, panelParams) ? null : { ...recordState };
}

/** Shallow equality over two panel-state bags — the gate on both directions of
 *  the record ↔ params sync, so an unchanged panel writes nothing. */
export function sameParams(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => Object.is(a[k], b[k]))
  );
}
