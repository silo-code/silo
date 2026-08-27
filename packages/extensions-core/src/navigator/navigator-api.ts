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
}
