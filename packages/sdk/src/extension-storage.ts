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
 * The two persisted-storage scopes available to an extension, exposed as
 * {@link ExtensionContext.storage}.
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
}
