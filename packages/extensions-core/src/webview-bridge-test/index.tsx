import type { DockPanelProps, Extension } from "@silo-code/sdk";
import { WebviewBridgeTestPanel } from "./WebviewBridgeTestPanel";

// Diagnostic panel for `ctx.webview` (see
// docs/proposals/0011-iframe-navigation-events.md). Exercises the bridge
// end-to-end — shim injection, nav events, exec, element picking, native
// snapshot capture — against real cross-origin iframes, and doubles as a
// reference implementation of the public API (it consumes `ctx.webview` the
// same way any third-party extension would). Kept permanently as dev
// tooling for verifying the bridge still works after a Tauri/wry upgrade or
// similar platform-level change — not scheduled for removal. Deliberately
// has no `addMenuItem` (so it never appears in "New Panel" menus) and no
// toolbar/status entry; the only way in is the Window menu item below,
// gated to dev builds (same pattern as core.menu's Reload/Inspect Element —
// see menu/index.ts's `import.meta.env.DEV` block).
export const extension: Extension = {
  id: "core.webview-bridge-test",
  manifest: {
    name: "Webview Bridge Test",
    description:
      "Diagnostic panel and reference implementation for ctx.webview.",
  },
  activate(ctx) {
    // Gated on the dev build in full — panel kind, command, and menu item —
    // same as core.menu's Reload/Inspect Element. Registering the command or
    // panel kind unconditionally would leave this reachable via
    // ctx.executeCommand("core.webviewBridgeTest.open") in release builds,
    // bypassing the "webview" permission's install-time consent entirely.
    if (import.meta.env.DEV) {
      ctx.registerDockPanelKind({
        id: "webview-bridge-test",
        component: (props: DockPanelProps) => (
          <WebviewBridgeTestPanel {...props} ctx={ctx} />
        ),
      });

      ctx.registerCommand({
        id: "core.webviewBridgeTest.open",
        label: "Webview Bridge Test",
        run: () =>
          ctx.layout.openPanel(
            "webview-bridge-test",
            { title: "Webview Bridge Test" },
            { singleton: true },
          ),
      });

      ctx.registerMenuItem({
        id: "core.menu.webviewBridgeTest",
        menu: "window",
        command: "core.webviewBridgeTest.open",
        group: "9_dev",
        order: -5,
      });
    }
  },
};
