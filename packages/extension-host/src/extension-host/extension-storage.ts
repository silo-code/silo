import { subscribe } from "valtio";
import { store } from "../state/store";
import type { ExtensionStorage } from "@silo-code/sdk";

// Namespaced persisted key/value storage. The public contract lives in
// @silo-code/sdk (extension-storage.ts); this is the host impl. Two backings:
// `globalExtensionState` (shared across workspaces — `ctx.storage.global`) and
// `extensionState` (per-workspace — `ctx.storage.workspace` + side panels).

type Bag = Record<string, unknown>;
type BagMap = Record<string, Bag>;

// The map is read through a getter on each call so the storage instance always
// sees the live bag — `extensionState` is replaced wholesale when the active
// workspace switches, so a captured reference would go stale.
function makeStorage(
  getMap: () => BagMap,
  namespace: string,
): ExtensionStorage {
  function ensureBag(): Bag {
    const map = getMap();
    let bag = map[namespace];
    if (!bag) {
      bag = {};
      map[namespace] = bag;
    }
    return bag;
  }

  return {
    get<T>(key: string, fallback?: T): T | undefined {
      const bag = getMap()[namespace];
      if (!bag) return fallback;
      const v = bag[key];
      return v === undefined ? fallback : (v as T);
    },
    set(key, value) {
      const bag = ensureBag();
      if (value === undefined) {
        delete bag[key];
      } else {
        bag[key] = value;
      }
    },
    keys() {
      const bag = getMap()[namespace];
      return bag ? Object.keys(bag) : [];
    },
    subscribe(listener) {
      // Subscribe to the whole store (so the listener survives the bag being
      // replaced on workspace switch / hydration), but only notify when this
      // namespace's content changed or the store finished hydrating — not on
      // every unrelated mutation.
      const snapshot = (): string =>
        JSON.stringify(getMap()[namespace] ?? null);
      let lastSnapshot = snapshot();
      let lastHydrated = store.hydrated;
      return subscribe(store, () => {
        const nextSnapshot = snapshot();
        const hydratedChanged = store.hydrated !== lastHydrated;
        if (nextSnapshot !== lastSnapshot || hydratedChanged) {
          lastSnapshot = nextSnapshot;
          lastHydrated = store.hydrated;
          listener();
        }
      });
    },
  };
}

const globalCache = new Map<string, ExtensionStorage>();
const workspaceCache = new Map<string, ExtensionStorage>();

/** @internal — host factory for `ctx.storage.global` (shared across workspaces). */
export function getGlobalExtensionStorage(namespace: string): ExtensionStorage {
  let api = globalCache.get(namespace);
  if (!api) {
    api = makeStorage(() => store.globalExtensionState, namespace);
    globalCache.set(namespace, api);
  }
  return api;
}

/** @internal — host factory for `ctx.storage.workspace` and `SidePanelProps.storage`. */
export function getWorkspaceExtensionStorage(
  namespace: string,
): ExtensionStorage {
  let api = workspaceCache.get(namespace);
  if (!api) {
    api = makeStorage(() => store.extensionState, namespace);
    workspaceCache.set(namespace, api);
  }
  return api;
}
