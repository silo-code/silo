import type { DockPanelProps, Extension } from "@silo-code/sdk";
import { BridgePanel, STYLE_ID, STYLES } from "./BridgePanel";

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = STYLES;
  document.head.appendChild(el);
}

function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

// Diagnostic panel for `ctx.webview` (see
// docs/proposals/0011-iframe-navigation-events.md). Exercises the bridge
// end-to-end — shim injection, nav events, exec, element picking, native
// snapshot capture — against real cross-origin iframes, and doubles as a
// reference implementation of the public API (it consumes `ctx.webview` the
// same way any third-party extension would). Deliberately has no "New Panel"
// menu entry (so it never appears in that menu) and no toolbar/status entry —
// the only way in is the Window menu item / command below.
export const extension: Extension = {
  id: "silo.webview-bridge-demo",
  activate(ctx) {
    injectStyles();

    ctx.subscriptions.push(
      ctx.registerDockPanelKind({
        id: "webview-bridge-demo",
        component: (props: DockPanelProps) => (
          <BridgePanel {...props} ctx={ctx} />
        ),
      }),
    );

    ctx.subscriptions.push(
      ctx.registerCommand({
        id: "silo.webview-bridge-demo.open",
        label: "Webview Bridge Demo",
        run: () =>
          ctx.layout.openPanel(
            "webview-bridge-demo",
            { title: "Webview Bridge Demo" },
            { singleton: true },
          ),
      }),
    );

    ctx.subscriptions.push(
      ctx.registerMenuItem({
        id: "webview-bridge-demo.window",
        menu: "window",
        command: "silo.webview-bridge-demo.open",
        group: "9_dev",
      }),
    );
  },
  deactivate() {
    removeStyles();
  },
};
