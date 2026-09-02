import type { ComponentType } from "react";

/**
 * Published by `core.navigator` for `core.layout` to compose into the Layout
 * settings page's **Navigator** tab (bundled-only composition, the same pattern
 * as `silo.agents` → `core.agents-settings`). `core.navigator` owns the
 * `navigatorPrefs` store, so the editor for it has to come from here.
 */
export interface NavigatorExtensionAPI {
  /** The **Navigator** settings tab's body — reorder / enable views. */
  SettingsPanel: ComponentType;
  /**
   * The synthetic `ToolbarItemContext["navigator"].viewId` the Navigator passes
   * from its single **unscoped-chrome slot** — the Add-workspace "+"'s home:
   * the Workspaces View List row (one-at-a-time), that view's View Header when
   * the list is hidden, or its stacked section header (ADR 0048). An item whose
   * `when` matches this value renders there and nowhere else; a normal per-view
   * item matches a real view id and never sees it.
   *
   * `null` when the Workspaces view is disabled — the slot isn't rendered and
   * the "+" lives only on the workspace status-bar item. `core.workspaces`
   * reads this to place its "+".
   */
  unscopedChromeTarget(): string | null;
}
