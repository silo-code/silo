/**
 * The path a dock panel is showing, for the host-drawn breadcrumb (RFC 0039).
 *
 * The host draws the chrome strip for any {@link DockPanelKind} that declares
 * `toolbar`, but it cannot know the panel's path — an editor's `filePath` is
 * host state, a dock panel's is the extension's business and changes over time
 * (the chat panel's is its session `cwd`). So the panel publishes it through
 * {@link DockPanelApi.setBreadcrumb}, the host wrapper in `dock-panel-kinds.ts`
 * records it here, and `DockPanelChrome` reads it back.
 *
 * Mirrors `agent-surface-registry.ts`: the panel states a fact about itself and
 * host chrome routes on it, with a per-panel subscription so a crumb change
 * re-renders only that panel's strip.
 */

import type { Disposable } from "@silo-code/sdk";

export interface PanelBreadcrumb {
  filePath: string;
  workspaceFolder?: string;
  leafIcon?: "file" | "folder";
}

/** panelId → its current crumb (`null` = strip with no path crumbs). */
const byPanel = new Map<string, PanelBreadcrumb | null>();
const listeners = new Map<string, Set<() => void>>();

function emit(panelId: string): void {
  const set = listeners.get(panelId);
  if (set) for (const l of set) l();
}

/**
 * Publish (or, with `null`, clear) the crumb for a panel. Idempotent for an
 * unchanged value so a panel may call it from a render effect.
 */
export function setPanelBreadcrumb(
  panelId: string,
  crumb: PanelBreadcrumb | null,
): void {
  const prev = byPanel.get(panelId);
  if (prev === crumb) return;
  if (
    prev &&
    crumb &&
    prev.filePath === crumb.filePath &&
    prev.workspaceFolder === crumb.workspaceFolder &&
    prev.leafIcon === crumb.leafIcon
  ) {
    return;
  }
  byPanel.set(panelId, crumb);
  emit(panelId);
}

/**
 * The panel's crumb. Three states: a {@link PanelBreadcrumb} (show it), `null`
 * (the panel called `setBreadcrumb(null)` — show no path crumbs), or
 * `undefined` (the panel has not declared one yet — show a placeholder).
 */
export function getPanelBreadcrumb(
  panelId: string,
): PanelBreadcrumb | null | undefined {
  return byPanel.get(panelId);
}

/** Subscribe to crumb changes for one panel. */
export function subscribePanelBreadcrumb(
  panelId: string,
  listener: () => void,
): Disposable {
  let set = listeners.get(panelId);
  if (!set) {
    set = new Set();
    listeners.set(panelId, set);
  }
  set.add(listener);
  return {
    dispose: () => {
      const s = listeners.get(panelId);
      if (s) {
        s.delete(listener);
        if (s.size === 0) listeners.delete(panelId);
      }
    },
  };
}

/** Drop a panel's crumb entirely — called when the panel unmounts. */
export function clearPanelBreadcrumb(panelId: string): void {
  if (byPanel.delete(panelId)) emit(panelId);
}

/** @internal — test helper. */
export function _resetPanelChromeRegistryForTests(): void {
  byPanel.clear();
  listeners.clear();
}
