import type { Extension } from "@silo-code/sdk";
import { makeLayoutSettingsPage } from "./LayoutSettingsPage";

// `core.layout` — the "Layout" settings page (small-screen mode's on/off
// switch + width threshold, plus Global Side Panel Layout). The auto-hide/
// peek behavior and panel-state mechanics themselves are host-internal
// (extension-host/small-screen-mode.ts, state/workspaces.ts, always wired
// into AppShell); this extension only owns the user-facing settings surface,
// same division as core.editor/core.terminal owning their settings pages
// over a host-internal core.
export const extension: Extension = {
  id: "core.layout",
  activate(ctx) {
    ctx.registerSettingsPage({
      id: "layout",
      title: "Layout",
      group: "1_general",
      // After Keyboard Shortcuts (0), Editor (1), Terminal (2).
      order: 3,
      component: makeLayoutSettingsPage(ctx),
    });
  },
};
