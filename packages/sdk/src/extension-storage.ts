import type { Disposable } from "./types";

/**
 * Namespaced, persisted key/value storage handed to extensions. Two scopes are
 * exposed on {@link ExtensionContext.storage} ({@link ExtensionStorageScopes}):
 * `global` (one bag per extension, shared across every workspace) and
 * `workspace` (one bag per extension × the active workspace). Side panels also
 * receive a workspace-scoped bag keyed by panel id via `SidePanelProps.storage`.
 *
 * Values persist alongside the rest of the app state. The store hydrates
 * asynchronously, and the workspace bag is swapped when the active workspace
 * changes, so consumers that need to react to restored or switched values
 * should {@link ExtensionStorage.subscribe | subscribe} and re-read.
 *
 * @category Consumer Services
 * @public
 */
export interface ExtensionStorage {
  /** Read a value. Returns `fallback` if the key is missing. */
  get<T>(key: string): T | undefined;
  get<T>(key: string, fallback: T): T;
  /** Write a value. `undefined` deletes the key. */
  set(key: string, value: unknown): void;
  /** The keys currently set in this namespace. */
  keys(): string[];
  /**
   * Subscribe to changes in this namespace. Called when a value in this
   * namespace changes, when the underlying app state finishes hydrating, and
   * (for the workspace scope) when the active workspace changes.
   *
   * Returns a {@link Disposable} — call `.dispose()` to unsubscribe, or push
   * it onto `ctx.subscriptions` for automatic teardown. Consistent with every
   * other subscription in the SDK.
   */
  subscribe(listener: () => void): Disposable;
}

/**
 * The persisted-storage scopes available to an extension, exposed as
 * {@link ExtensionContext.storage}: two key/value bags for settings-sized
 * state, and the two matching **directories** for real data files.
 *
 * @category Consumer Services
 * @public
 */
export interface ExtensionStorageScopes {
  /**
   * Per-extension storage shared across **all** workspaces — the place for
   * an extension's own settings (enabled features, layout choices, etc.).
   */
  readonly global: ExtensionStorage;
  /**
   * Per-extension storage scoped to the **active workspace** — the place for
   * state that should differ per workspace (last selection, per-project
   * toggles). The bag is swapped when the active workspace changes.
   */
  readonly workspace: ExtensionStorage;
  /**
   * An absolute path to a **directory of your own**, shared across every
   * workspace — the filesystem counterpart to {@link ExtensionStorageScopes.global}.
   * Use it for real data files (a `.jsonl` log, a cache, an export) rather than
   * inventing a path under the user's home directory.
   *
   * The directory is created on first call and lives under Silo's user-config
   * root, namespaced by your extension id:
   * `~/.config/silo/extension-storage/<your-id>/global`. The path is stable
   * across calls, activations, and restarts.
   *
   * **No filesystem permission is needed inside it.** Paths beneath this
   * directory are readable and writable through {@link ExtensionContext.files}
   * without declaring `fs:read` or `fs:write` — your own storage is inside your
   * sandbox, the same way the open workspace folder is. The lift stops at
   * `ctx.files`: running a process with a working directory in here still needs
   * the `process` permission (passing the path to a command as an *argument*
   * needs nothing extra).
   *
   * Relative paths passed to `ctx.files` still resolve against the **workspace**,
   * not this directory — always join onto the absolute path you get back.
   *
   * ```ts
   * const dir = await ctx.storage.globalDir();
   * await ctx.files.writeText(`${dir}/tasks.jsonl`, body);
   * ```
   *
   * Uninstalling your extension does **not** delete this directory unless the
   * user opts in; the data survives a reinstall.
   */
  globalDir(): Promise<string>;
  /**
   * An absolute path to a directory of your own scoped to the **active
   * workspace** — the filesystem counterpart to
   * {@link ExtensionStorageScopes.workspace}. Created on first call, at
   * `~/.config/silo/extension-storage/<your-id>/workspaces/<workspaceId>`.
   *
   * Everything {@link ExtensionStorageScopes.globalDir} says about permissions
   * and relative paths applies here too. Call it again after the active
   * workspace changes — the path changes with it, so don't cache it across a
   * workspace switch.
   *
   * The directory follows the workspace's **identity**, not its folder path:
   * deleting a workspace and re-adding the same folder gives you a new, empty
   * directory (the same rule {@link ExtensionStorageScopes.workspace} follows).
   * Deleting a workspace leaves the directory on disk.
   *
   * Rejects with `NoWorkspaceError` when no workspace is open.
   */
  workspaceDir(): Promise<string>;
}
