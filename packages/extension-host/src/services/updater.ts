// Host-side auto-updater seam — thin, stateless wrappers over the Tauri updater
// + process plugins. The reactive `UpdateService`
// (extension-host/update-service.ts) and the `core.updates` extension layer
// policy, state, and UI on top of these. The stable-app gate keeps the
// side-by-side "Silo Dev" build (com.silo.app.dev) and `tauri dev` from ever
// trying to replace themselves.
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getIdentifier } from "@tauri-apps/api/app";

/**
 * The Tauri update handle, re-exported so host modules can hold one without
 * importing the plugin directly.
 */
export type { Update };

const STABLE_IDENTIFIER = "com.silo.desktop";

/** True only for the packaged stable app — never `tauri dev` or the "Silo Dev" build. */
export async function isStableApp(): Promise<boolean> {
  if (import.meta.env.DEV) return false;
  try {
    return (await getIdentifier()) === STABLE_IDENTIFIER;
  } catch {
    return false;
  }
}

/** Ask the configured endpoint whether a newer release exists (`null` if up to date). */
export function checkForUpdate(): Promise<Update | null> {
  return check();
}

/** Download + install the given update, then restart into the new version. */
export async function installUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
