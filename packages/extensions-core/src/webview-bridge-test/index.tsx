import type { DockPanelProps, Extension } from "@silo-code/sdk";
import { WebviewBridgeTestPanel } from "./WebviewBridgeTestPanel";

// Phase 1 of the `ctx.webview` iframe bridge (see
// docs/proposals/0011-iframe-navigation-events.md). This extension exists
// solely to exercise the bridge end-to-end — shim injection, nav events,
// exec, element picking, native snapshot capture — on real cross-origin
// iframes across macOS/Windows/Linux before any of it becomes a public SDK
// surface. Deliberately has no `addMenuItem` (so it never appears in "New
// Panel" menus) and no toolbar/status entry; the only way in is the Window
// menu item below, gated to dev builds (same pattern as core.menu's
// Reload/Inspect Element — see menu/index.ts's `import.meta.env.DEV` block).
// Delete this extension once Phase 2 ships `ctx.webview` publicly and
// `local-web-viewer` becomes the real consumer.
export const extension: Extension = {
  id: "core.webview-bridge-test",
  manifest: {
    name: "Webview Bridge Test",
    description:
      "Internal diagnostic panel for the ctx.webview bridge (Phase 1).",
  },
  activate(ctx) {
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

    if (import.meta.env.DEV) {
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
