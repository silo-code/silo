import { getName, getVersion } from "@tauri-apps/api/app";

// Thin wrapper over `@tauri-apps/api/app` — the leaf-layer seam for app
// identity metadata, mirroring `tauri-fs`/`tauri-watch`. Consumed by
// extension-host/app-service.ts; never imported by extensions directly.

/** Resolve the application version from the bundle manifest (e.g. `"0.2.0"`). */
export function appVersion(): Promise<string> {
  return getVersion();
}

/** Resolve the application's display name (e.g. `"Silo"`). */
export function appName(): Promise<string> {
  return getName();
}
