import type { MenuEntry, SidePanel, SidePanelTabDisplay } from "@silo-code/sdk";
import {
  SIDE_PANEL_TAB_DISPLAY_MODES,
  resolveTabDisplay,
} from "../state/side-panel-tab-display";

const MODE_LABELS: Readonly<Record<SidePanelTabDisplay, string>> = {
  icon: "Icon",
  title: "Title",
  both: "Icon and Title",
};

/**
 * A "Tab Display" submenu parent for one tab — three checkable rows, the
 * current one checked.
 *
 * A submenu rather than a flat header section (the shape
 * `sidePanelVisibilityItems` uses) because the tab menu already carries move,
 * split, and the full visibility list; three more top-level rows would push it
 * past a glanceable length.
 *
 * Returns `[]` for a panel with no icon: with only "Title" selectable the
 * submenu would be a dead end, and a disabled parent row is just noise. Built
 * here rather than in `TabBar` because the component dispatches menus, it
 * doesn't decide what is in them (same split as `panel-tab-menu.ts`).
 */
export function sidePanelTabDisplayItems(
  panel: SidePanel,
  modes: Readonly<Record<string, SidePanelTabDisplay>>,
  pick: (panelId: string, mode: SidePanelTabDisplay) => void,
): MenuEntry[] {
  if (panel.icon == null) return [];
  const current = resolveTabDisplay(panel, modes);
  return [
    {
      label: "Tab Display",
      submenu: SIDE_PANEL_TAB_DISPLAY_MODES.map((mode) => ({
        label: MODE_LABELS[mode],
        checked: mode === current,
        run: () => pick(panel.id, mode),
      })),
    },
  ];
}
