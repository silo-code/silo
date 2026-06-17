/**
 * Live-extension watch-folder service.
 *
 * Watches `{userConfigDir}/live-extensions/` for `.js` bundles. Any bundle
 * dropped there is loaded immediately as a trusted extension; updating the file
 * hot-replaces it; deleting it unloads it. Bundles survive app restarts (they
 * are re-loaded on the next boot), but are NOT written to `installed.json` —
 * they stay outside the formal install registry so there's no install wizard,
 * no version management, and no entry in the Extensions settings page.
 *
 * The bundle must be a single-file ESM module that exports `const extension:
 * Extension` (or a default export of the same shape) where `extension.id`
 * matches the filename stem (e.g. `live.tasks.js` → id `live.tasks`).
 *
 * Extensions loaded here receive `trusted: true` context — unscoped
 * `ctx.files`/`ctx.process` — because the user explicitly placed them in their
 * personal config directory. This is identical to the trust level bundled
 * extensions receive.
 *
 * @internal
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { userConfigDir } from "../services/user-config";
import { fsReadDir, fsCreateDir } from "../services/tauri-fs";
import { loadExtension, unloadExtension } from "./extension-loader";

const WATCH_ID = "__silo-live-extensions__";

function idFromFilename(name: string): string {
  return name.replace(/\.js$/, "");
}

interface FileChangedPayload {
  watch_id: string;
  paths: string[];
  kind: string;
}

export async function initLiveExtensions(): Promise<void> {
  const root = await userConfigDir();
  const dir = `${root}/live-extensions`;

  await fsCreateDir(dir).catch(() => {});

  const entries = await fsReadDir(dir).catch(() => []);
  for (const entry of entries) {
    if (entry.isDir || !entry.name.endsWith(".js")) continue;
    const id = idFromFilename(entry.name);
    await loadExtension({ id, dir, main: entry.name, trusted: true }).catch(
      (err) => console.error(`[live-ext] failed to load ${entry.name}:`, err),
    );
  }

  await invoke("start_watch", { watchId: WATCH_ID, path: dir });

  await listen<FileChangedPayload>("file:changed", (event) => {
    const { watch_id, paths, kind } = event.payload;
    if (watch_id !== WATCH_ID) return;

    for (const filePath of paths) {
      const parts = filePath.split("/");
      const name = parts[parts.length - 1] ?? "";
      if (!name.endsWith(".js")) continue;
      const id = idFromFilename(name);

      if (kind.startsWith("Remove")) {
        unloadExtension(id);
      } else {
        // Create or Modify — hot-replace (unload is a no-op if not loaded).
        unloadExtension(id);
        loadExtension({ id, dir, main: name, trusted: true }).catch((err) =>
          console.error(`[live-ext] reload failed for ${name}:`, err),
        );
      }
    }
  });
}
