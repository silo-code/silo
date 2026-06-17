// Single-file built-in extension contributing a settings (gear) button to the
// status bar, between the theme picker and the panel toggles. Authored exactly
// as an external extension would be: imports only public SDK types + shared
// deps (React, @phosphor-icons/react), and acts on the app only through `ctx`
// (the core-owned `settings.open` command).

import type { Extension } from "@silo-code/sdk";
import { Sliders } from "@phosphor-icons/react";
import "./settings-button.css";

export const extension: Extension = {
  id: "core.settings-button",
  activate(ctx) {
    // The component closes over `ctx`; identity is stable (activate runs once).
    function SettingsButton() {
      return (
        <button
          className="settings-button"
          aria-label="Settings"
          onClick={() => ctx.executeCommand("settings.open")}
        >
          <Sliders size="1.3em" weight="fill" />
        </button>
      );
    }

    ctx.registerStatusItem({
      id: "settings-button",
      alignment: "right",
      // Between the theme picker (-10) and the panel toggles (0).
      priority: -5,
      tooltip: "Settings",
      component: SettingsButton,
    });
  },
};
