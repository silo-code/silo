/**
 * The single owner of the **extension storage directory** layout (RFC 0032) —
 * the per-extension directories behind `ctx.storage.globalDir()` /
 * `ctx.storage.workspaceDir()`. Everything about "where does an extension's
 * data live" is here; nothing else in the host builds these paths.
 *
 * The root is `<userConfigDir>/extension-storage` (ADR 0022 tier 1 — this is
 * user data: a person is meant to find, grep, and back up what an extension
 * writes here, which is exactly why it isn't in the app-data blob):
 *
 * ```
 * ~/.config/silo[-<identity>]/extension-storage/<extensionId>/
 * ├── global/            ← ctx.storage.globalDir()
 * └── workspaces/<wsId>/ ← ctx.storage.workspaceDir() / workspaceDirs()
 * ```
 *
 * The `global/` + `workspaces/` split (rather than global content sitting at
 * `<extensionId>/` directly) means `workspaces` is never a name an extension
 * could collide with inside its own global directory — no reserved names.
 *
 * `resolvePath` is synchronous and has to decide against these paths, so the
 * root is resolved **eagerly at startup** ({@link initStorageRoot}) rather than
 * lazily on the first `globalDir()` call: an extension may cache its absolute
 * path in `ctx.storage.global` in one session and use it at the top of
 * `activate()` in the next, never calling `globalDir()` at all.
 *
 * @internal
 */
import { userConfigDir } from "../services/user-config";
import {
  fsCreateDir,
  fsDelete,
  fsPathExists,
  fsReadDir,
  fsRename,
} from "../services/tauri-fs";
import { extHostLog } from "./extension-host-logger";
import { normalizePath, withinRoots } from "./security/resolve-path";

/** The directory name under the user-config root. */
const STORAGE_DIR_NAME = "extension-storage";

/**
 * The same charset `parseManifest` enforces on `silo.id` at install time.
 * Re-checked here as defence in depth — this module turns ids into filesystem
 * paths, and a bad one must fail loudly rather than escape the root.
 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Caps on {@link extensionDataInfo}'s walk. A storage directory is normally
 * tiny, but an extension is free to fill it — the uninstall confirm must not
 * hang on a `node_modules` someone dropped in there.
 */
const WALK_MAX_ENTRIES = 5_000;
const WALK_MAX_DEPTH = 12;

/** Resolved once at startup; `null` until then (and if resolution failed). */
let storageRoot: string | null = null;
let rootPromise: Promise<string> | null = null;

function assertValidId(extensionId: string): void {
  if (!ID_PATTERN.test(extensionId)) {
    throw new Error(
      `Invalid extension id for storage: ${JSON.stringify(extensionId)}`,
    );
  }
}

/**
 * Resolve (and cache) `<userConfigDir>/extension-storage`. Idempotent — the
 * in-flight promise is shared, so the startup call and a racing `globalDir()`
 * resolve the same root.
 *
 * Does **not** create the root: an extension that never asks for a directory
 * leaves nothing on disk.
 */
export function initStorageRoot(): Promise<string> {
  if (rootPromise) return rootPromise;
  rootPromise = userConfigDir()
    .then((dir) => {
      storageRoot = `${dir}/${STORAGE_DIR_NAME}`;
      return storageRoot;
    })
    .catch((err: unknown) => {
      // Leave the root unset so own-dir paths deny through the normal rules
      // rather than silently resolving somewhere unexpected. Loud, and named.
      rootPromise = null;
      extHostLog.error(
        "Extension storage root could not be resolved — extensions cannot use ctx.storage.globalDir()/workspaceDir()",
        { error: err instanceof Error ? err.message : String(err) },
      );
      throw err;
    });
  return rootPromise;
}

/** The resolved root, or `null` before {@link initStorageRoot} has settled. */
export function storageRootPath(): string | null {
  return storageRoot;
}

/**
 * Reset module state. Test-only seam — the root is process-lifetime state in
 * the app.
 *
 * @internal
 */
export function resetStorageRootForTests(): void {
  storageRoot = null;
  rootPromise = null;
}

/** `<root>/<extensionId>` — the per-extension subtree, both scopes included. */
function extensionRoot(root: string, extensionId: string): string {
  assertValidId(extensionId);
  return `${root}/${extensionId}`;
}

/**
 * The paths this extension may currently touch through `ctx.files` without an
 * `fs:*` permission. Synchronous by necessity (`resolvePath` is), which is why
 * the root is resolved at startup; empty only before that completes, or if it
 * failed.
 *
 * Each open workspace's directory is included — whether or not it has been
 * created yet, so a cached path from a previous session works at the top of
 * `activate()`, and cross-workspace aggregation via `workspaceDirs()` can read
 * and write through `ctx.files` without `fs:*`.
 */
export function ownDirPaths(
  extensionId: string,
  workspaceIds: readonly string[] = [],
): readonly string[] {
  const root = storageRoot;
  if (!root || !ID_PATTERN.test(extensionId)) return [];
  const base = `${root}/${extensionId}`;
  const paths = [`${base}/global`];
  for (const workspaceId of workspaceIds) {
    if (ID_PATTERN.test(workspaceId)) {
      paths.push(`${base}/workspaces/${workspaceId}`);
    }
  }
  return paths;
}

/**
 * True when `path` is inside the extension-storage root (watcher filtering).
 *
 * Uses the same normalized containment test as the path scope rather than a raw
 * string compare: the root can carry a doubled or trailing slash (a
 * `SILO_CONFIG_DIR` override is used verbatim), while paths arriving here have
 * already been normalized by `resolvePath` — comparing the two literally would
 * silently miss and quietly re-enable the noise filter inside storage.
 */
export function isStoragePath(path: string): boolean {
  const root = storageRoot;
  if (!root) return false;
  return withinRoots([root], normalizePath(path));
}

/** Create-on-first-call; the body behind `ctx.storage.globalDir()`. */
export async function ensureGlobalDir(extensionId: string): Promise<string> {
  const root = await initStorageRoot();
  const dir = `${extensionRoot(root, extensionId)}/global`;
  await fsCreateDir(dir);
  return dir;
}

/**
 * The body behind `ctx.storage.workspaceDir()` / `workspaceDirs()`. Resolves
 * `<root>/<extensionId>/workspaces/<workspaceId>` for any workspace id — the
 * caller decides whether it is the active one. Creates the directory unless
 * `create` is `false` (a read-only caller that only wants the path).
 */
export async function resolveWorkspaceDir(
  extensionId: string,
  workspaceId: string,
  options: { create?: boolean } = {},
): Promise<string> {
  const root = await initStorageRoot();
  if (!ID_PATTERN.test(workspaceId)) {
    throw new Error(`Invalid workspace id for storage: ${workspaceId}`);
  }
  const dir = `${extensionRoot(root, extensionId)}/workspaces/${workspaceId}`;
  if (options.create ?? true) await fsCreateDir(dir);
  return dir;
}

/** What the uninstall confirm needs to describe an extension's data. */
export interface ExtensionDataInfo {
  /** Absolute path to `<root>/<extensionId>`. */
  path: string;
  /** Files found by the walk. */
  files: number;
  /** Total bytes across those files. */
  bytes: number;
  /**
   * The walk hit {@link WALK_MAX_ENTRIES} / {@link WALK_MAX_DEPTH}, so `files`
   * and `bytes` are floors, not totals — the UI says "size unknown" rather
   * than a wrong number.
   */
  truncated: boolean;
}

/**
 * Walk `dir` recursively, accumulating file count and bytes. Bounded on both
 * entries and depth; returns `truncated` when either cap stopped it. There is
 * no other recursive-walk helper in the host, and this one deliberately stays
 * private — it exists to size a small directory, not to be a general tool.
 */
async function walkFiles(dir: string): Promise<{
  files: number;
  bytes: number;
  truncated: boolean;
}> {
  let files = 0;
  let bytes = 0;
  let truncated = false;
  const queue: { path: string; depth: number }[] = [{ path: dir, depth: 0 }];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    if (next.depth > WALK_MAX_DEPTH) {
      truncated = true;
      continue;
    }
    const entries = await fsReadDir(next.path);
    for (const entry of entries) {
      if (entry.isDir) {
        queue.push({ path: entry.path, depth: next.depth + 1 });
        continue;
      }
      files += 1;
      bytes += entry.size;
      if (files >= WALK_MAX_ENTRIES) {
        return { files, bytes, truncated: true };
      }
    }
  }
  return { files, bytes, truncated };
}

/**
 * File count + total bytes for an extension's storage directory, or `null` when
 * the directory is absent **or holds no files at all** — both mean "there is
 * nothing for the user to lose", and the uninstall confirm shows no checkbox.
 *
 * A failed or capped walk is reported as "data present, size unknown"
 * (`truncated`) rather than propagating: an unreadable directory must never
 * block an uninstall. Crucially, `null` is returned only for a walk that
 * actually **completed** and found nothing — a truncated walk means "we don't
 * know", which callers must not read as "nothing to lose" (uninstall deletes a
 * file-free directory unconditionally, so conflating the two loses data).
 */
export async function extensionDataInfo(
  extensionId: string,
): Promise<ExtensionDataInfo | null> {
  const root = storageRoot ?? (await initStorageRoot().catch(() => null));
  if (!root) return null;
  const path = extensionRoot(root, extensionId);
  if (!(await fsPathExists(path))) return null;
  try {
    const { files, bytes, truncated } = await walkFiles(path);
    if (files === 0 && !truncated) return null;
    return { path, files, bytes, truncated };
  } catch {
    return { path, files: 0, bytes: 0, truncated: true };
  }
}

/**
 * Whether an extension's storage directory exists at all — including the
 * file-free case {@link extensionDataInfo} reports as `null`. Uninstall uses
 * this to sweep away an empty directory rather than littering.
 */
export async function extensionDataExists(
  extensionId: string,
): Promise<boolean> {
  const root = storageRoot ?? (await initStorageRoot().catch(() => null));
  if (!root) return false;
  return fsPathExists(extensionRoot(root, extensionId));
}

/** Recursive removal — opt-in delete at uninstall, and empty-dir cleanup. */
export async function deleteExtensionData(extensionId: string): Promise<void> {
  const root = await initStorageRoot();
  const path = extensionRoot(root, extensionId);
  if (await fsPathExists(path)) await fsDelete(path);
}

/**
 * Carry a storage directory across an extension-id migration (R7), so the
 * "Your settings were kept" promise covers files too. Idempotent: a missing
 * `<oldId>` is a no-op. Refuses to clobber an existing `<newId>` — a rename is
 * not worth losing data over — logging the conflict and leaving both in place.
 */
export async function renameExtensionData(
  oldId: string,
  newId: string,
): Promise<void> {
  const root = await initStorageRoot();
  const from = extensionRoot(root, oldId);
  const to = extensionRoot(root, newId);
  if (!(await fsPathExists(from))) return;
  if (await fsPathExists(to)) {
    extHostLog.warn(
      `Extension storage for "${oldId}" was left in place: "${newId}" already has a storage directory`,
      { from, to },
    );
    return;
  }
  await fsRename(from, to);
}
