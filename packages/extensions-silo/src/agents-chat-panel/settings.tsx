/**
 * The Chat panel's settings-page component. Split from `settings-store.ts` so
 * the pure store (and its unit tests) never has to load the real
 * `@silo-code/sdk` runtime — this file is the only place that does, via
 * `useServiceState`.
 *
 * Embedded in Settings → Agents → **Chat** by `core.agents-settings`, which
 * reaches it through this extension's published API (see `chat-panel-api.ts`).
 */

import { Section, SettingRow, Switch, useServiceState } from "@silo-code/sdk";
import { chatPanelSettingsService } from "./settings-store";

export {
  chatPanelSettingsService,
  initChatPanelSettings,
  clearChatPanelSettingsListeners,
  DEFAULT_CONFIRM_BEFORE_CLEAR,
  type ChatPanelSettings,
} from "./settings-store";

export function ChatPanelSettingsPanel() {
  const settings = useServiceState(chatPanelSettingsService);
  return (
    <Section label="Clearing a session">
      <SettingRow
        label="Confirm before clearing a session"
        hint="Clear Session ends the conversation and permanently discards its transcript. Turn this off to skip the confirmation — the same thing the confirmation's “Don't ask again” box does."
      >
        <Switch
          checked={settings.confirmBeforeClear}
          onChange={(confirmBeforeClear) =>
            chatPanelSettingsService.set({ confirmBeforeClear })
          }
          aria-label="Confirm before clearing a session"
        />
      </SettingRow>
    </Section>
  );
}
