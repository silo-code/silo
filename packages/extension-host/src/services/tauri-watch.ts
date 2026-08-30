import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface FileChangeEvent {
  watchId: string;
  paths: string[];
  kind: string;
}

interface RawFileChangeEvent {
  watch_id: string;
  paths: string[];
  kind: string;
}

/**
 * Start a recursive watch on `path`.
 *
 * `filterNoise` (default `true`) applies the backend's project-tree skip list
 * (`node_modules/`, `dist/`, `.cache/`, …). The host turns it off for paths
 * inside the extension-storage root, where those names are ordinary folders an
 * extension chose (RFC 0032).
 */
export function startWatch(
  watchId: string,
  path: string,
  filterNoise = true,
): Promise<void> {
  return invoke("start_watch", { watchId, path, filterNoise });
}

export function stopWatch(watchId: string): Promise<void> {
  return invoke("stop_watch", { watchId });
}

export async function onFileChange(
  cb: (event: FileChangeEvent) => void,
): Promise<UnlistenFn> {
  return listen<RawFileChangeEvent>("file:changed", (e) => {
    cb({
      watchId: e.payload.watch_id,
      paths: e.payload.paths,
      kind: e.payload.kind,
    });
  });
}
