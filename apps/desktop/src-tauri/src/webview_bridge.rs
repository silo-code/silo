// Phase 1 of the `ctx.webview` iframe bridge (see docs/proposals/0011-iframe-navigation-events.md).
//
// Registers a Tauri plugin whose sole job is to inject `webview_bridge.js`
// into every frame of every webview — including cross-origin iframes. Tauri's
// `js_init_script_on_all_frames` runs the script before any page script, in
// the main frame AND all subframes (WKUserScript forMainFrameOnly:false on
// macOS; subframes are always injected on Windows; webkitgtk all-frames flag
// on Linux). The shim is inert until a panel handshakes with it directly
// (see webview_bridge.js) — third-party page code cannot self-activate it.
//
// This is internal-only in Phase 1: no ExtensionContext surface, no SDK
// change. It exists so the hidden `core.webview-bridge-test` panel (and,
// later, the real `ctx.webview` service) has something to talk to.
use tauri::{plugin::Builder, plugin::TauriPlugin, Runtime};

const BRIDGE_SCRIPT: &str = include_str!("webview_bridge.js");

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("silo-webview-bridge")
        .js_init_script_on_all_frames(BRIDGE_SCRIPT)
        .build()
}
