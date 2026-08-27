/**
 * `core.navigator`'s own preferences: the user's view order, the set of views
 * they've turned off, and whether the panel shows one view at a time or stacks
 * them all. Persisted in `core.navigator`'s `ctx.storage.global` — the same bag
 * that holds the `activeView` key — since these are global "how the Navigator
 * is arranged" choices, not per-workspace lenses (RFC 0023 / RFC 0030).
 *
 * A tiny `ReactiveService` module singleton, mirroring the agent settings
 * store (`extensions-silo/src/agents/settings-store.ts`): the panel reads it
 * with `useServiceState`, the settings tab writes it with `set()`, and both
 * live in different extensions (`core.navigator` owns the store; `core.layout`
 * renders the editor via `getExtension`), so keeping the state here — not in
 * host state and not in a component — is what lets that composition work.
 *
 * Types-only `@silo-code/sdk` import so this module (and its unit test) never
 * loads the SDK runtime.
 */

import type { ExtensionStorage, ReactiveService } from "@silo-code/sdk";

/** How the Navigator arranges its enabled views (RFC 0030). */
export type ViewArrangement = "one-at-a-time" | "stacked";

export const DEFAULT_ARRANGEMENT: ViewArrangement = "one-at-a-time";

/** The persisted Navigator preferences. */
export interface NavigatorPrefs {
  /**
   * View ids in the user's chosen order. A registered id not listed here sorts
   * after every listed id (by `NavigatorView.order` then title). An id listed
   * here that isn't currently registered is kept untouched, so a view returns
   * to its slot when its extension is re-enabled.
   */
  viewOrder: readonly string[];
  /**
   * View ids the user has turned off — filtered out of the Navigator entirely.
   * Retained across (un)registration, same as {@link viewOrder} entries.
   */
  disabledViews: readonly string[];
  /**
   * `"one-at-a-time"` (default): the View List + a single Active View.
   * `"stacked"`: no View List; every enabled view is a collapsible section in
   * {@link viewOrder}.
   */
  arrangement: ViewArrangement;
  /**
   * In stacked mode, the view ids whose section is collapsed. Absent = expanded.
   * Retained across (un)registration, same as the lists above.
   */
  stackedCollapsed: readonly string[];
}

const STORAGE_KEY_VIEW_ORDER = "navigatorViewOrder";
const STORAGE_KEY_DISABLED_VIEWS = "navigatorDisabledViews";
const STORAGE_KEY_ARRANGEMENT = "navigatorArrangement";
const STORAGE_KEY_STACKED_COLLAPSED = "navigatorStackedCollapsed";

const DEFAULT_PREFS: NavigatorPrefs = {
  viewOrder: [],
  disabledViews: [],
  arrangement: DEFAULT_ARRANGEMENT,
  stackedCollapsed: [],
};

/** Coerce persisted JSON to a string array — anything else becomes `[]`. */
function coerceIdList(v: unknown): readonly string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string")
    ? (v as string[])
    : [];
}

function coerceArrangement(v: unknown): ViewArrangement {
  return v === "stacked" || v === "one-at-a-time" ? v : DEFAULT_ARRANGEMENT;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

let prefs: NavigatorPrefs = DEFAULT_PREFS;
let backingStorage: ExtensionStorage | null = null;
const listeners = new Set<(p: NavigatorPrefs) => void>();

export const navigatorPrefsService: ReactiveService<NavigatorPrefs> & {
  set(patch: Partial<NavigatorPrefs>): void;
} = {
  getState: () => prefs,
  subscribe(listener) {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  },
  set(patch) {
    prefs = { ...prefs, ...patch };
    backingStorage?.set(STORAGE_KEY_VIEW_ORDER, [...prefs.viewOrder]);
    backingStorage?.set(STORAGE_KEY_DISABLED_VIEWS, [...prefs.disabledViews]);
    backingStorage?.set(STORAGE_KEY_ARRANGEMENT, prefs.arrangement);
    backingStorage?.set(STORAGE_KEY_STACKED_COLLAPSED, [
      ...prefs.stackedCollapsed,
    ]);
    for (const l of listeners) l(prefs);
  },
};

/**
 * Bind persisted storage to the service — call once from `core.navigator`'s
 * `activate()`. Reads immediately and re-reads on every storage change, since
 * `ctx.storage` hydrates asynchronously and a value saved last session (or in
 * another window) may not be present the instant `activate` runs.
 */
export function initNavigatorPrefs(storage: ExtensionStorage): {
  dispose(): void;
} {
  backingStorage = storage;
  function read() {
    const viewOrder = coerceIdList(
      storage.get<unknown>(STORAGE_KEY_VIEW_ORDER, prefs.viewOrder),
    );
    const disabledViews = coerceIdList(
      storage.get<unknown>(STORAGE_KEY_DISABLED_VIEWS, prefs.disabledViews),
    );
    const arrangement = coerceArrangement(
      storage.get<unknown>(STORAGE_KEY_ARRANGEMENT, prefs.arrangement),
    );
    const stackedCollapsed = coerceIdList(
      storage.get<unknown>(
        STORAGE_KEY_STACKED_COLLAPSED,
        prefs.stackedCollapsed,
      ),
    );
    if (
      !sameList(viewOrder, prefs.viewOrder) ||
      !sameList(disabledViews, prefs.disabledViews) ||
      arrangement !== prefs.arrangement ||
      !sameList(stackedCollapsed, prefs.stackedCollapsed)
    ) {
      prefs = {
        ...prefs,
        viewOrder,
        disabledViews,
        arrangement,
        stackedCollapsed,
      };
      for (const l of listeners) l(prefs);
    }
  }
  read();
  const sub = storage.subscribe(read);
  return { dispose: () => sub.dispose() };
}

/** Test seam — drop all subscribers and reset to compiled defaults. */
export function clearNavigatorPrefsListeners(): void {
  listeners.clear();
  prefs = DEFAULT_PREFS;
  backingStorage = null;
}
