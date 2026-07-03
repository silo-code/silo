import type { Disposable } from "./types";

// `ctx.files` — host-mediated filesystem access. The public contract; the host
// implementation (a single chokepoint over the privileged Tauri fs/watch
// commands) lives in the extension host.

/**
 * Metadata for a single directory entry, as returned by
 * {@link FileService.readDir}.
 *
 * @category Core Types
 * @public
 */
export interface FileMeta {
  /** The entry's base name (no path). */
  name: string;
  /** Absolute path to the entry. */
  path: string;
  /** True if the entry is a directory. */
  isDir: boolean;
  /** Size in bytes (0 for directories). */
  size: number;
  /** Last-modified time, milliseconds since the Unix epoch. */
  modifiedMs: number;
}

/**
 * The normalized kind of a filesystem change, as delivered in
 * {@link FileChangeEvent.kind}. Backend-specific event kinds that don't map to
 * one of the three meaningful values are surfaced as `"other"`.
 *
 * @category Core Types
 * @public
 */
export type FileChangeKind = "create" | "modify" | "remove" | "other";

/**
 * A filesystem change event delivered to a {@link FileService.watch} listener,
 * for changes under that watch's path.
 *
 * @category Core Types
 * @public
 */
export interface FileChangeEvent {
  /** The paths that changed in this event. */
  paths: string[];
  /**
   * Normalized change kind. The host maps the backend's vocabulary to this
   * closed union; backend-specific kinds that don't match arrive as `"other"`.
   * Always compare against the union values — never against raw backend strings.
   */
  kind: FileChangeKind;
}

/**
 * The filesystem domain, exposed as {@link ExtensionContext.files}. All access
 * is host-mediated: extensions read, write, and watch the filesystem through
 * here rather than calling Tauri directly.
 *
 * **Paths are workspace-scoped.** A relative path resolves against the open
 * workspace folder (`"src/index.ts"` → `<workspace>/src/index.ts`); an absolute
 * path is allowed only if it falls inside a workspace folder. A path outside the
 * workspace throws {@link PathDeniedError} unless the extension declared the
 * matching {@link Permission} (`fs:read` for reads, `fs:write` for writes).
 * First-party (bundled) extensions are unscoped. Prefer relative paths — they're
 * portable across machines.
 *
 * Watching is host-owned: {@link FileService.watch} expresses intent — "tell me
 * about changes under this path" — and the host owns the underlying OS
 * watcher(s). Many in-workspace subscriptions are served from a single,
 * ref-counted workspace watcher the host manages; extensions never start or
 * stop watchers themselves, and each listener receives only events scoped to
 * its path.
 *
 * @category Consumer Services
 * @public
 */
export interface FileService {
  /** Read a file's contents as UTF-8 text. */
  readText(path: string): Promise<string>;
  /** Read a file's raw bytes. */
  readBytes(path: string): Promise<ArrayBuffer>;
  /** List a directory's immediate entries. */
  readDir(path: string): Promise<FileMeta[]>;
  /**
   * Resolve true if a file or directory exists at `path`. Prefer
   * {@link FileService.stat} when you also need the entry's metadata — `stat`
   * returning non-`null` subsumes this check in one call.
   */
  pathExists(path: string): Promise<boolean>;
  /**
   * Metadata for a single path, following symlinks, or `null` if nothing
   * exists there. Resolving `null` (rather than rejecting) for an absent path
   * is deliberate — it makes `stat` a one-call replacement for
   * {@link FileService.pathExists} that also returns size / mtime / type.
   * Rejects only on a real I/O error (e.g. a permission failure).
   */
  stat(path: string): Promise<FileMeta | null>;
  /** Write UTF-8 text to a file, creating or overwriting it. */
  writeText(path: string, content: string): Promise<void>;
  /**
   * Write raw bytes to a file, creating or overwriting it (and creating any
   * missing parent directories). The byte-oriented counterpart to
   * {@link FileService.writeText} / {@link FileService.readBytes} — use it for
   * binary assets (images, archives) where `writeText` would corrupt the data.
   */
  writeBytes(path: string, data: ArrayBuffer | Uint8Array): Promise<void>;
  /** Create a directory (and any missing parents). */
  createDir(path: string): Promise<void>;
  /**
   * Copy a file or directory from `src` to `dest`, recursively for
   * directories, creating any missing parent directories. Requires read access
   * to `src` and write access to `dest` (both are workspace-scoped). Overwrites
   * existing files at the destination.
   */
  copy(src: string, dest: string): Promise<void>;
  /** Rename / move a file or directory. */
  rename(oldPath: string, newPath: string): Promise<void>;
  /**
   * **Permanently** delete a file or directory (directories are removed
   * recursively). This does **not** move the entry to the OS trash/recycle
   * bin — the delete is irreversible, so confirm destructive removals with the
   * user first. Rejects if the path does not exist.
   */
  delete(path: string): Promise<void>;
  /** Reveal a path in the OS file manager (Finder / Explorer). */
  reveal(path: string): Promise<void>;
  /**
   * Watch `path` recursively, invoking `listener` for each change under it.
   * Returns a {@link Disposable} that stops listening when disposed. Watcher
   * lifecycle is the host's concern — in-workspace paths ride the host's
   * ref-counted workspace watcher rather than each spinning up its own.
   */
  watch(path: string, listener: (event: FileChangeEvent) => void): Disposable;
}
