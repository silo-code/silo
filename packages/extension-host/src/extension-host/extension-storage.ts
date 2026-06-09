import { subscribe } from "valtio";
import { store } from "../state/store";
import type { ExtensionStorage } from "@silo-code/sdk";

// `SidePanelProps.storage` — namespaced persisted key/value storage. The public
// contract lives in @silo-code/sdk (extension-storage.ts); this is the host impl.

const cache = new Map<string, ExtensionStorage>();

/** @internal — host factory; extensions receive this as `SidePanelProps.storage`. */
export function getExtensionStorage(namespace: string): ExtensionStorage {
  const existing = cache.get(namespace);
  if (existing) return existing;

  function ensureBag(): Record<string, unknown> {
    let bag = store.extensionState[namespace];
    if (!bag) {
      bag = {};
      store.extensionState[namespace] = bag;
    }
    return bag;
  }

  const api: ExtensionStorage = {
    get<T>(key: string, fallback?: T): T | undefined {
      const bag = store.extensionState[namespace];
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
    subscribe(listener) {
      let lastHydrated = store.hydrated;
      const unsub = subscribe(store, () => {
        if (store.hydrated !== lastHydrated) {
          lastHydrated = store.hydrated;
          listener();
          return;
        }
        listener();
      });
      return unsub;
    },
  };

  cache.set(namespace, api);
  return api;
}
