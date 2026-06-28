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
