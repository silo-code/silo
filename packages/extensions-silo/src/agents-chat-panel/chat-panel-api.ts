import type { ComponentType } from "react";

/** Published by `silo.agents-chat-panel` for `core.agents-settings`
 *  (bundled-only composition, the same edge `silo.agents` already uses). */
export interface ChatPanelExtensionAPI {
  /** Embedded in the Agents settings page's **Chat** tab. */
  SettingsPanel: ComponentType;
}
