import { proxy } from "valtio";
import type { Disposable, ExtensionStorage } from "@silo-code/sdk";

/** Persisted on `core.extensions` global storage once the user opens the panel. */
export const VISITED_KEY = "hasVisitedExtensionsPage";

/**
 * Reactive mirror of the visited flag so surfaces outside `core.extensions`
 * (the status-bar settings button) can observe it without sharing storage.
 * Synced by {@link bindExtensionsOnboarding}.
 */
export const extensionsOnboarding = proxy({ visited: false });

/** Unset or non-true ⇒ never visited (onboarding still active). */
export function readVisited(storage: ExtensionStorage): boolean {
  return storage.get(VISITED_KEY) === true;
}

/** Persist the first visit (idempotent). */
export function markVisited(storage: ExtensionStorage): void {
  if (!readVisited(storage)) {
    storage.set(VISITED_KEY, true);
  }
}

/**
 * Keep {@link extensionsOnboarding} in sync with `storage` (initial read +
 * hydrate / mutation subscriptions). Returns a disposable that unbinds.
 */
export function bindExtensionsOnboarding(
  storage: ExtensionStorage,
): Disposable {
  const sync = () => {
    extensionsOnboarding.visited = readVisited(storage);
  };
  sync();
  return storage.subscribe(sync);
}
