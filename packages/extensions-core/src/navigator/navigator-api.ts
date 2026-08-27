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
   * In the **stacked** arrangement, the id of the view whose section should
   * carry otherwise-unscoped `"navigator"` toolbar chrome (the Add-workspace
   * "+") — so it appears once, not on every section. `null` in the
   * one-at-a-time arrangement, where such chrome shows on every view as
   * before. `core.workspaces` reads this to scope its "+" in stacked mode.
   */
  stackedChromeHostViewId(): string | null;
}
