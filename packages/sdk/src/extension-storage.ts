/**
 * Namespaced, persisted key/value storage handed to side-panel components
 * via `SidePanelProps.storage`. Each panel id gets its own bag; values are
 * persisted alongside the rest of the app state.
 *
 * The store is hydrated asynchronously after the panels mount, so consumers
 * that need to wait for restored values should check `props.hydrated` or
 * use `subscribe` to re-read once it flips.
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
  /**
   * Subscribe to changes in this namespace. Called on any set within this
   * namespace, and also whenever the underlying app state finishes hydrating
   * (so callers can re-read after persisted state loads).
   */
  subscribe(listener: () => void): () => void;
}
