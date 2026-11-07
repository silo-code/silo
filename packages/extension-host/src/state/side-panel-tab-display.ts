import type { SidePanel, SidePanelTabDisplay } from "@silo-code/sdk";

// ─── side-panel tab display mode ─────────────────────────────────────────────
//
// Whether a SideDock tab shows its panel's icon, its title, or both. A user
// preference rather than a contribution: the extension offers the artwork
// (`SidePanel.icon`), the user picks per tab from the tab's context menu.
//
// Deliberately **app-global**, not per-workspace-with-an-opt-in-flag the way
// side panel layout is (ADR 0035) — see ADR 0058. The map therefore lives on
// `AppState` beside `uiFontSize` and never passes through
// `capturePanelState`/`applyPanelState`.
//
// The pure mode logic lives here, in `state`, because persistence needs
// `coerceTabDisplay` at hydrate and `state` may not import out of itself. The
// menu that drives it is `layout/side-panel-tab-display-menu.ts`.

/** Title-only — what the tab strip rendered before icons existed. */
export const DEFAULT_SIDE_PANEL_TAB_DISPLAY: SidePanelTabDisplay = "title";

/** Every mode, in the order the context menu lists them. */
export const SIDE_PANEL_TAB_DISPLAY_MODES: readonly SidePanelTabDisplay[] = [
  "icon",
  "title",
  "both",
];

/**
 * Narrow an untrusted persisted value to a mode, falling back to the default.
 *
 * The stored map is a bag of panel ids written by older (or newer) versions and
 * editable by hand, so a junk value must degrade to a readable tab rather than
 * render an unlabelled one.
 */
export function coerceTabDisplay(raw: unknown): SidePanelTabDisplay {
  return SIDE_PANEL_TAB_DISPLAY_MODES.includes(raw as SidePanelTabDisplay)
    ? (raw as SidePanelTabDisplay)
    : DEFAULT_SIDE_PANEL_TAB_DISPLAY;
}

/**
 * The **effective** mode for a panel's tab: the stored choice, except that a
 * panel with no icon always renders as `"title"`.
 *
 * That clamp is what keeps a third-party panel built against an older SDK (no
 * `icon` field) from rendering an empty tab if a mode was stored for its id —
 * by an earlier version of the extension that did have one, or by a stale blob.
 */
export function resolveTabDisplay(
  panel: SidePanel,
  modes: Readonly<Record<string, SidePanelTabDisplay>>,
): SidePanelTabDisplay {
  const stored = coerceTabDisplay(modes[panel.id]);
  return panel.icon == null ? "title" : stored;
}
