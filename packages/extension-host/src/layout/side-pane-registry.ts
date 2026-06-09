import type { Disposable } from "@silo-code/sdk";

/**
 * Imperative handle a {@link PanelPane} publishes so commands can drive its tab
 * selection from outside React (mirrors `dock-api-registry` for the center
 * dock). Keyed by side slot ("left", "left-bottom", "right", "right-bottom").
 */
export interface SidePaneController {
  /** Ordered panel ids shown in this pane's tab bar. */
  panelIds(): string[];
  /** Currently active panel id, or null. */
  activeId(): string | null;
  /** Make a panel active — the same path a tab click takes. */
  activate(id: string): void;
}

const controllers = new Map<string, SidePaneController>();

export function registerSidePane(
  slot: string,
  ctrl: SidePaneController,
): Disposable {
  controllers.set(slot, ctrl);
  return {
    dispose: () => {
      if (controllers.get(slot) === ctrl) controllers.delete(slot);
    },
  };
}

function focusTab(slot: string, panelId: string): boolean {
  const btn = document.querySelector<HTMLElement>(
    `.side-pane[data-slot="${CSS.escape(slot)}"] ` +
      `.tab[data-panel-id="${CSS.escape(panelId)}"]`,
  );
  if (!btn) return false;
  btn.focus();
  return true;
}

/**
 * Move a side pane's active tab by `dir`, wrapping, and pull DOM focus onto the
 * newly-active tab button so the keyboard stays where the eye is. Returns false
 * when the slot is unknown or has fewer than two tabs.
 */
export function cycleSidePaneTab(slot: string, dir: 1 | -1): boolean {
  const ctrl = controllers.get(slot);
  if (!ctrl) return false;
  const ids = ctrl.panelIds();
  if (ids.length < 2) return false;
  const cur = ctrl.activeId();
  const idx = cur ? ids.indexOf(cur) : -1;
  const next = ids[(idx + dir + ids.length) % ids.length];
  ctrl.activate(next);
  focusTab(slot, next);
  return true;
}

/**
 * Focus a side pane's active tab button — the dock's entry point when focus
 * cycles into it. Returns false when the slot is unknown or empty.
 */
export function focusSidePaneActiveTab(slot: string): boolean {
  const id = controllers.get(slot)?.activeId();
  return id ? focusTab(slot, id) : false;
}
