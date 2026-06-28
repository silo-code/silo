import type { SystemInfo, SystemService } from "@silo-code/sdk";
import { systemInfo } from "../services/tauri-system";
import { appVersion } from "../services/tauri-app";

// OS/arch/version never change during a session — resolve once and reuse.
let cached: Promise<SystemInfo> | null = null;

function resolve(): Promise<SystemInfo> {
  if (cached) return cached;
  cached = Promise.all([systemInfo(), appVersion()]).then(
    ([{ os, arch }, siloVersion]) => ({
      os: os as SystemInfo["os"],
      arch,
      siloVersion,
    }),
  );
  return cached;
}

let service: SystemService | null = null;

export function getSystemService(): SystemService {
  if (service) return service;
  service = { getInfo: resolve };
  return service;
}
