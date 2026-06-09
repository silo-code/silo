//! Dev-shell devtools control. The frontend suppresses the webview's native
//! context menu app-wide (so Silo owns every menu), which also removes the
//! native "Inspect Element". In debug builds that action moves to the Window
//! menu and routes through this command — the JS API has no runtime devtools
//! control, only a build-time config flag.

/// Open the webview devtools ("Inspect Element"). Available in debug builds or
/// when the `devtools` feature is enabled; a no-op otherwise, so the frontend
/// can call it without guarding on the build profile.
#[tauri::command]
pub fn open_devtools(window: tauri::WebviewWindow) {
    #[cfg(any(debug_assertions, feature = "devtools"))]
    window.open_devtools();
    #[cfg(not(any(debug_assertions, feature = "devtools")))]
    let _ = window;
}
