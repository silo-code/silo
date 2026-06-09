import { homeDir as tauriHomeDir } from "@tauri-apps/api/path";

// Host-mediated OS/platform access for core extensions that need it for UI but
// where the capability isn't part of the public `ctx` surface. The host is free
// to import `@tauri-apps` here; core consumers reach this only through the gated
// `@silo-code/extension-host/internal` barrel (see sdk-internal.ts), which records the use.
//
// The native file/folder pickers that used to live here graduated to the public
// `ctx.ui` surface (see ui-service.ts); only `homeDir` remains, since it's a
// home-relative path-display concern, not user interaction. If a path util ever
// absorbs it, this file can go away entirely.

/** The user's home directory as an absolute path. */
export function homeDir(): Promise<string> {
  return tauriHomeDir();
}
