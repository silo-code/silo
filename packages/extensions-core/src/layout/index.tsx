import type { Extension } from "@silo-code/sdk";
import { LayoutSettingsPage } from "./LayoutSettingsPage";

// `core.layout` — the "Layout" settings page (small-screen mode's on/off
// switch + width threshold). The auto-hide/peek behavior itself is
// host-internal (extension-host/small-screen-mode.ts, always wired into
// AppShell); this extension only owns the user-facing settings surface, same
// division as core.editor/core.terminal owning their settings pages over a
// host-internal core.
export const extension: Extension = {
  id: "core.layout",
  activate(ctx) {
    ctx.registerSettingsPage({
      id: "layout",
      title: "Layout",
      group: "1_general",
      // After Keyboard Shortcuts (0), Editor (1), Terminal (2).
      order: 3,
      component: LayoutSettingsPage,
    });
  },
};
