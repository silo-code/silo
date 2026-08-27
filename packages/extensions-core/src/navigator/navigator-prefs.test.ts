import { describe, it, expect, beforeEach } from "vitest";
import type { ExtensionStorage } from "@silo-code/sdk";
import {
  navigatorPrefsService,
  initNavigatorPrefs,
  clearNavigatorPrefsListeners,
} from "./navigator-prefs";

/** In-memory ExtensionStorage stand-in, mirroring the host's real contract. */
function fakeStorage(
  initial: Record<string, unknown> = {},
): ExtensionStorage & { emit(): void } {
  const data = new Map<string, unknown>(Object.entries(initial));
  const listeners = new Set<() => void>();
  return {
    get: ((key: string, fallback?: unknown) =>
      data.has(key) ? data.get(key) : fallback) as ExtensionStorage["get"],
    set(key, value) {
      if (value === undefined) data.delete(key);
      else data.set(key, value);
    },
    keys: () => [...data.keys()],
    subscribe(listener) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    emit() {
      for (const l of listeners) l();
    },
  };
}

beforeEach(() => {
  clearNavigatorPrefsListeners();
});

describe("navigator prefs persistence", () => {
  it("defaults to empty order / disabled set", () => {
    const sub = initNavigatorPrefs(fakeStorage());
    expect(navigatorPrefsService.getState()).toEqual({
      viewOrder: [],
      disabledViews: [],
    });
    sub.dispose();
  });

  it("hydrates a persisted order and disabled set (restart case)", () => {
    const sub = initNavigatorPrefs(
      fakeStorage({
        navigatorViewOrder: ["silo.agents.by-status", "workspaces"],
        navigatorDisabledViews: ["workspaces"],
      }),
    );
    expect(navigatorPrefsService.getState().viewOrder).toEqual([
      "silo.agents.by-status",
      "workspaces",
    ]);
    expect(navigatorPrefsService.getState().disabledViews).toEqual([
      "workspaces",
    ]);
    sub.dispose();
  });

  it("coerces a non-array persisted value to an empty list", () => {
    const sub = initNavigatorPrefs(
      fakeStorage({
        navigatorViewOrder: "workspaces",
        navigatorDisabledViews: 3,
      }),
    );
    expect(navigatorPrefsService.getState().viewOrder).toEqual([]);
    expect(navigatorPrefsService.getState().disabledViews).toEqual([]);
    sub.dispose();
  });

  it("coerces an array with non-string entries to an empty list", () => {
    const sub = initNavigatorPrefs(
      fakeStorage({ navigatorViewOrder: ["ok", 42] }),
    );
    expect(navigatorPrefsService.getState().viewOrder).toEqual([]);
    sub.dispose();
  });

  it("persists a change through set()", () => {
    const storage = fakeStorage();
    const sub = initNavigatorPrefs(storage);
    navigatorPrefsService.set({ viewOrder: ["a", "b"] });
    expect(storage.get<string[]>("navigatorViewOrder")).toEqual(["a", "b"]);
    sub.dispose();
  });

  it("picks up a value that arrives after activation (async hydration)", () => {
    const storage = fakeStorage();
    const sub = initNavigatorPrefs(storage);
    expect(navigatorPrefsService.getState().disabledViews).toEqual([]);
    storage.set("navigatorDisabledViews", ["workspaces"]);
    storage.emit();
    expect(navigatorPrefsService.getState().disabledViews).toEqual([
      "workspaces",
    ]);
    sub.dispose();
  });

  it("notifies subscribers on set() so the panel re-renders", () => {
    const sub = initNavigatorPrefs(fakeStorage());
    const seen: string[][] = [];
    const l = navigatorPrefsService.subscribe((p) =>
      seen.push([...p.viewOrder]),
    );
    navigatorPrefsService.set({ viewOrder: ["x"] });
    expect(seen).toEqual([["x"]]);
    l.dispose();
    sub.dispose();
  });

  it("dispose stops reacting to further storage changes", () => {
    const storage = fakeStorage();
    const sub = initNavigatorPrefs(storage);
    sub.dispose();
    storage.set("navigatorViewOrder", ["a"]);
    storage.emit();
    expect(navigatorPrefsService.getState().viewOrder).toEqual([]);
  });
});
