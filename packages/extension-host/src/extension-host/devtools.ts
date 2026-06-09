import { invoke } from "@tauri-apps/api/core";

// Dev-shell window actions. Silo suppresses the webview's native context menu
// app-wide (see menu-controller.ts), so the two things that menu used to offer —
// Reload and Inspect Element — move to the Window menu in dev builds
// (core.menu, gated on `import.meta.env.DEV`). Host-owned: they touch the
// platform (`invoke`) and the global window, so they're not capabilities for
// silo.*/third-party extensions — hence the `@silo-code/extension-host/internal` barrel.

/** Reload the webview — the native menu's "Reload". */
export function reloadWindow(): void {
  window.location.reload();
}

/**
 * Open the webview devtools — the native menu's "Inspect Element". Backed by
 * the `open_devtools` Tauri command, which is a no-op outside debug/`devtools`
 * builds, so this is safe to call unconditionally.
 */
export function openDevtools(): void {
  void invoke("open_devtools");
}
