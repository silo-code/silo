import { describe, it, expect, beforeEach } from "vitest";
import type { ExtensionStorage } from "@silo-code/sdk";
import {
  initManualOrder,
  manualOrderService,
  resetManualOrder,
} from "./manual-order";

function fakeStorage(
  initial: Record<string, unknown> = {},
): ExtensionStorage & {
  hydrate(): void;
} {
  const data = new Map<string, unknown>(Object.entries(initial));
  let listener: (() => void) | null = null;
  return {
    get: ((key: string, fallback?: unknown) =>
      data.has(key) ? data.get(key) : fallback) as ExtensionStorage["get"],
    set(key, value) {
      if (value === undefined) data.delete(key);
      else data.set(key, value);
    },
    keys: () => [...data.keys()],
    subscribe(l) {
      listener = l;
      return {
        dispose: () => {
          listener = null;
        },
      };
    },
    hydrate() {
      listener?.();
    },
  };
}

// The module holds its state in a singleton (it's extension-scoped, like
// ./done-since), so each test starts from a clean one.
beforeEach(() => resetManualOrder());

describe("initManualOrder", () => {
  it("seeds from persisted storage", () => {
    initManualOrder(fakeStorage({ agentsRecentManualOrder: ["b", "a"] }));
    expect(manualOrderService.getState()).toEqual(["b", "a"]);
  });

  it("starts empty when nothing is persisted", () => {
    initManualOrder(fakeStorage());
    expect(manualOrderService.getState()).toEqual([]);
  });

  it("re-reads when storage notifies after async hydrate", () => {
    const storage = fakeStorage();
    initManualOrder(storage);
    expect(manualOrderService.getState()).toEqual([]);
    storage.set("agentsRecentManualOrder", ["b", "a"]);
    storage.hydrate();
    expect(manualOrderService.getState()).toEqual(["b", "a"]);
  });
});

describe("manualOrderService.set", () => {
  it("updates state and persists the new order", () => {
    const storage = fakeStorage();
    initManualOrder(storage);
    manualOrderService.set(["c", "a", "b"]);
    expect(manualOrderService.getState()).toEqual(["c", "a", "b"]);
    expect(storage.get<string[]>("agentsRecentManualOrder")).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("notifies subscribers", () => {
    initManualOrder(fakeStorage());
    const seen: (readonly string[])[] = [];
    const sub = manualOrderService.subscribe((order) => seen.push(order));
    manualOrderService.set(["a"]);
    expect(seen).toEqual([["a"]]);
    sub.dispose();
  });

  it("stops notifying a disposed subscriber", () => {
    initManualOrder(fakeStorage());
    const seen: (readonly string[])[] = [];
    const sub = manualOrderService.subscribe((order) => seen.push(order));
    sub.dispose();
    manualOrderService.set(["a"]);
    expect(seen).toEqual([]);
  });
});
