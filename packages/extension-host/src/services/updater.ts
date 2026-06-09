// Host-side auto-updater glue. This is app-shell infrastructure (not an
// extension): it talks to the Tauri updater + process plugins directly. The
// launch check is gated to the *stable* bundle identifier so the side-by-side
// "Silo Dev" build (com.silo.app.dev) never tries to replace itself.
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { getIdentifier } from "@tauri-apps/api/app";

const STABLE_IDENTIFIER = "com.silo.desktop";

/** True only for the packaged stable app — never the `tauri dev` dev build. */
async function isStableApp(): Promise<boolean> {
  if (import.meta.env.DEV) return false;
  try {
    return (await getIdentifier()) === STABLE_IDENTIFIER;
  } catch {
    return false;
  }
}

async function promptAndApply(update: Update): Promise<void> {
  const ok = await ask(
    `Silo ${update.version} is available.\n\nInstall it and restart now?`,
    { title: "Update available", kind: "info" },
  );
  if (!ok) return;
  await update.downloadAndInstall();
  await relaunch();
}

/**
 * Manual "Check for Updates…" — always reports a result (up-to-date, error, or
 * an install prompt). Safe to call from any build.
 */
export async function checkForUpdatesInteractive(): Promise<void> {
  let update: Update | null = null;
  try {
    update = await check();
  } catch (err) {
    await message(`Couldn't check for updates.\n\n${String(err)}`, {
      title: "Silo",
      kind: "error",
    });
    return;
  }
  if (!update) {
    await message("You're on the latest version.", { title: "Silo" });
    return;
  }
  await promptAndApply(update);
}

/**
 * Silent check on launch. No-ops in dev and in the "Silo Dev" build; only the
 * installed stable app reaches out, and only prompts if an update exists.
 */
export async function checkForUpdatesOnLaunch(): Promise<void> {
  if (!(await isStableApp())) return;
  try {
    const update = await check();
    if (update) await promptAndApply(update);
  } catch (err) {
    console.warn("[updater] launch check failed", err);
  }
}
