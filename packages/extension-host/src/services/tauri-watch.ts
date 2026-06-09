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

export function startWatch(watchId: string, path: string): Promise<void> {
  return invoke("start_watch", { watchId, path });
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
