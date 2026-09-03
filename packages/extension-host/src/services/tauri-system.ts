import { invoke } from "@tauri-apps/api/core";

// Thin wrapper over the `system_info` Tauri command — the leaf-layer seam for
// host-platform metadata. Mirrors tauri-app.ts / tauri-fs.ts in shape.

interface RawSystemInfo {
  os: string;
  arch: string;
}

/** Resolve the host OS and CPU architecture from the binary's compile-time constants. */
export function systemInfo(): Promise<RawSystemInfo> {
  return invoke<RawSystemInfo>("system_info");
}

/** The user's login shell (`$SHELL`, else `/bin/bash`; `COMSPEC`, else
 *  `cmd.exe` on Windows) — RFC 0033 phase 3. Read once at host init; see
 *  `login-shell.ts` for why it is cached rather than awaited per call. */
export function defaultShell(): Promise<string> {
  return invoke<string>("default_shell");
}
