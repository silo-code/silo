import type { ComponentType } from "react";

/** Published by `silo.agents` for `core.agents-settings` (bundled-only composition). */
export interface AgentsExtensionAPI {
  /** Embedded in the settings page's **Behavior** tab. */
  BehaviorPanel: ComponentType;
  /** Embedded in the settings page's **Navigator** tab. */
  NavigatorPanel: ComponentType;
  /** Embedded in the settings page's **Display** tab. */
  DisplayPanel: ComponentType;
}
