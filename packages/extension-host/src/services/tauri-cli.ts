import { invoke } from "@tauri-apps/api/core";

// Thin wrapper over the host's `cli_install_shim` command — the leaf-layer seam
// for installing the `silo` shell command, mirroring `tauri-app`/`tauri-watch`.
// Consumed by `core.cli-install` via the privileged internal barrel; never
// imported by extensions directly.

/**
 * Install a `silo` shim onto the user's PATH (`~/.local/bin/silo`) pointing at
 * the running app binary. Resolves to a human-readable status string; rejects
 * with the host error message on failure.
 */
export function installCliShim(): Promise<string> {
  return invoke<string>("cli_install_shim");
}
