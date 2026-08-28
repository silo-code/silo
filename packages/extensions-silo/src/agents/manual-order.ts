/**
 * The persisted row order for the "Recent" view's flat section — a plain
 * list of terminal ids. Updated when the user drag-reorders, and when the
 * panel reconciles newcomers (prepended at the top) or closed/stale rows
 * (dropped). Empty until the first reconcile or drag; display applies the
 * same rule via `orderAgeRows` / `reconcileAgeManualOrder` in
 * `agents-panel-view.ts`.
 *
 * A `ReactiveService` like `./settings-store`, rather than folded into that
 * store directly: it's read the same way (`useServiceState` in
 * `agents-panel.tsx`) but changes for a different reason — a user drag or
 * reconcile, not a settings-page edit — and keeping it separate means a
 * settings change never has to reason about drag state or vice versa.
 */

import type { ExtensionStorage, ReactiveService } from "@silo-code/sdk";

const STORAGE_KEY = "agentsRecentManualOrder";

let order: readonly string[] = [];
let backingStorage: ExtensionStorage | null = null;
const listeners = new Set<(order: readonly string[]) => void>();

export const manualOrderService: ReactiveService<readonly string[]> & {
  set(next: readonly string[]): void;
} = {
  getState: () => order,
  subscribe(listener) {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  },
  set(next) {
    order = next;
    backingStorage?.set(STORAGE_KEY, [...next]);
    for (const l of listeners) l(order);
  },
};

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Seed from persisted storage — re-reads on hydrate / id migration. */
export function initManualOrder(storage: ExtensionStorage): {
  dispose(): void;
} {
  backingStorage = storage;
  function read() {
    const next = storage.get<string[]>(STORAGE_KEY, []);
    if (sameOrder(next, order)) return;
    order = next;
    for (const l of listeners) l(order);
  }
  read();
  const sub = storage.subscribe(read);
  return { dispose: () => sub.dispose() };
}

/** Drop all state — tests only, so one case can't leak into the next. */
export function resetManualOrder(): void {
  backingStorage = null;
  order = [];
  listeners.clear();
}
