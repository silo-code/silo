import type { SystemInfo, SystemService } from "@silo-code/sdk";
import { systemInfo } from "../services/tauri-system";
import { appVersion } from "../services/tauri-app";
import { homeDir as platformHomeDir } from "./platform";

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

// The user's home directory never changes during a session either — resolve
// once and reuse, same as SystemInfo above.
let cachedHome: Promise<string> | null = null;

function resolveHomeDir(): Promise<string> {
  if (!cachedHome) cachedHome = platformHomeDir();
  return cachedHome;
}

let service: SystemService | null = null;

export function getSystemService(): SystemService {
  if (service) return service;
  service = { getInfo: resolve, homeDir: resolveHomeDir };
  return service;
}
