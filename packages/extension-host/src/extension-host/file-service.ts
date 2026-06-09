import {
  fsReadText,
  fsReadBytes,
  fsWriteText,
  fsCreateDir,
  fsPathExists,
  fsRename,
  fsDelete,
  fsReveal,
  fsReadDir,
} from "../services/tauri-fs";
import { startWatch, stopWatch, onFileChange } from "../services/tauri-watch";
import { resolvePath } from "./security/resolve-path";
import type { PathScope } from "./security/resolve-path";
import type { FileService, FileChangeEvent } from "@silo-code/sdk";

// `ctx.files` — host-mediated filesystem access. A single chokepoint over the
// privileged Tauri fs/watch commands. The public contract lives in
// @silo-code/sdk (file-service.ts); this is the host implementation.

let service: FileService | null = null;

// Host-owned watch registry, ref-counted by path. Multiple subscribers on the
// same path share a single backend watcher — so the file explorer and the git
// panel both watching a workspace root don't each spin up a recursive OS
// watcher. The watchId is host bookkeeping, hidden from the public surface
// (consumers get a Disposable instead).
let nextWatchId = 0;

interface WatchEntry {
  watchId: string;
  listeners: Set<(event: FileChangeEvent) => void>;
  unlisten: (() => void) | null;
  disposed: boolean;
}

const watches = new Map<string, WatchEntry>();

/** @internal — host factory; extensions receive this as `ctx.files`. */
export function getFileService(): FileService {
  if (service) return service;
  service = {
    readText: fsReadText,
    readBytes: fsReadBytes,
    readDir: fsReadDir,
    pathExists: fsPathExists,
    writeText: fsWriteText,
    createDir: fsCreateDir,
    rename: fsRename,
    delete: fsDelete,
    reveal: fsReveal,
    // Subscribe to changes under `path`, sharing one backend watcher per path
    // (ref-counted). Delivery is scoped by the watcher's `watchId`, so the
    // listener never sees another path's events and we don't path-match here.
    watch(path, listener) {
      let entry = watches.get(path);
      if (!entry) {
        const watchId = `ctx-files-${nextWatchId++}`;
        const created: WatchEntry = {
          watchId,
          listeners: new Set(),
          unlisten: null,
          disposed: false,
        };
        watches.set(path, created);
        void startWatch(watchId, path).catch((err) =>
          console.warn("ctx.files.watch failed", err),
        );
        void onFileChange((evt) => {
          if (evt.watchId !== watchId) return; // scope to this path's watcher
          const fileEvent: FileChangeEvent = {
            paths: evt.paths,
            kind: evt.kind,
          };
          for (const l of created.listeners) l(fileEvent);
        }).then((fn) => {
          if (created.disposed) fn();
          else created.unlisten = fn;
        });
        entry = created;
      }
      const target = entry;
      target.listeners.add(listener);
      return {
        dispose() {
          if (!target.listeners.delete(listener)) return; // already removed
          if (target.listeners.size > 0) return; // others still watch this path
          if (watches.get(path) !== target) return; // entry already replaced
          target.disposed = true;
          target.unlisten?.();
          void stopWatch(target.watchId).catch(() => {});
          watches.delete(path);
        },
      };
    },
  };
  return service;
}

/**
 * Wrap a {@link FileService} so every path argument is checked against `scope`
 * before it reaches the host. Reads use the `fs:read` capability, writes use
 * `fs:write`; an out-of-workspace path without the grant throws
 * {@link PathDeniedError} (synchronously — `await ctx.files.readText(p)` still
 * rejects into the caller's try/catch). Trusted scopes return the base service
 * unchanged. Pure over `base` so it's unit-testable without Tauri.
 *
 * @internal
 */
export function scopeFileService(
  base: FileService,
  scope: PathScope,
): FileService {
  if (scope.trusted) return base;
  // `async` so a denied path surfaces as a rejected promise (not a synchronous
  // throw) — consistent with these methods' Promise contract. `watch` is
  // synchronous, so it throws synchronously.
  const read = (p: string) => resolvePath(scope, p, "read");
  const write = (p: string) => resolvePath(scope, p, "write");
  return {
    readText: async (p) => base.readText(read(p)),
    readBytes: async (p) => base.readBytes(read(p)),
    readDir: async (p) => base.readDir(read(p)),
    pathExists: async (p) => base.pathExists(read(p)),
    writeText: async (p, content) => base.writeText(write(p), content),
    createDir: async (p) => base.createDir(write(p)),
    rename: async (oldPath, newPath) =>
      base.rename(write(oldPath), write(newPath)),
    delete: async (p) => base.delete(write(p)),
    reveal: async (p) => base.reveal(read(p)),
    watch: (p, listener) => base.watch(read(p), listener),
  };
}

/** @internal — the per-extension scoped `ctx.files`. */
export function getScopedFileService(scope: PathScope): FileService {
  return scopeFileService(getFileService(), scope);
}
