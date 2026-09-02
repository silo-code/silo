import { describe, it, expect, beforeEach } from "vitest";
import type { ExtensionStorage } from "@silo-code/sdk";
import {
  navigatorPrefsService,
  initNavigatorPrefs,
  clearNavigatorPrefsListeners,
  stepGroupColorIntensity,
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
    const state = navigatorPrefsService.getState();
    expect(state.viewOrder).toEqual([]);
    expect(state.disabledViews).toEqual([]);
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

describe("navigator arrangement pref", () => {
  it("defaults to one-at-a-time", () => {
    const sub = initNavigatorPrefs(fakeStorage());
    expect(navigatorPrefsService.getState().arrangement).toBe("one-at-a-time");
    expect(navigatorPrefsService.getState().stackedCollapsed).toEqual([]);
    sub.dispose();
  });

  it("hydrates a persisted stacked arrangement + collapsed set", () => {
    const sub = initNavigatorPrefs(
      fakeStorage({
        navigatorArrangement: "stacked",
        navigatorStackedCollapsed: ["silo.agents.by-status"],
      }),
    );
    expect(navigatorPrefsService.getState().arrangement).toBe("stacked");
    expect(navigatorPrefsService.getState().stackedCollapsed).toEqual([
      "silo.agents.by-status",
    ]);
    sub.dispose();
  });

  it("coerces an unknown arrangement value to the default", () => {
    const sub = initNavigatorPrefs(
      fakeStorage({ navigatorArrangement: "tiled" }),
    );
    expect(navigatorPrefsService.getState().arrangement).toBe("one-at-a-time");
    sub.dispose();
  });

  it("persists an arrangement change through set()", () => {
    const storage = fakeStorage();
    const sub = initNavigatorPrefs(storage);
    navigatorPrefsService.set({ arrangement: "stacked" });
    expect(storage.get<string>("navigatorArrangement")).toBe("stacked");
    sub.dispose();
  });

  it("picks up an arrangement that arrives after activation", () => {
    const storage = fakeStorage();
    const sub = initNavigatorPrefs(storage);
    expect(navigatorPrefsService.getState().arrangement).toBe("one-at-a-time");
    storage.set("navigatorArrangement", "stacked");
    storage.emit();
    expect(navigatorPrefsService.getState().arrangement).toBe("stacked");
    sub.dispose();
  });
});

describe("navigator group color intensity pref", () => {
  it("defaults to 1", () => {
    const sub = initNavigatorPrefs(fakeStorage());
    expect(navigatorPrefsService.getState().groupColorIntensity).toBe(1);
    sub.dispose();
  });

  it("hydrates a persisted value", () => {
    const sub = initNavigatorPrefs(
      fakeStorage({ navigatorGroupColorIntensity: 1.8 }),
    );
    expect(navigatorPrefsService.getState().groupColorIntensity).toBe(1.8);
    sub.dispose();
  });

  it("clamps a too-high value to the slider max", () => {
    const sub = initNavigatorPrefs(
      fakeStorage({ navigatorGroupColorIntensity: 9 }),
    );
    expect(navigatorPrefsService.getState().groupColorIntensity).toBe(2.4);
    sub.dispose();
  });

  it("clamps a too-low value to the slider min", () => {
    const sub = initNavigatorPrefs(
      fakeStorage({ navigatorGroupColorIntensity: 0 }),
    );
    expect(navigatorPrefsService.getState().groupColorIntensity).toBe(0.4);
    sub.dispose();
  });

  it("coerces a non-number to the default", () => {
    const sub = initNavigatorPrefs(
      fakeStorage({ navigatorGroupColorIntensity: "bold" }),
    );
    expect(navigatorPrefsService.getState().groupColorIntensity).toBe(1);
    sub.dispose();
  });

  it("persists a change through set()", () => {
    const storage = fakeStorage();
    const sub = initNavigatorPrefs(storage);
    navigatorPrefsService.set({ groupColorIntensity: 1.3 });
    expect(storage.get<number>("navigatorGroupColorIntensity")).toBe(1.3);
    sub.dispose();
  });

  it("picks up a value that arrives after activation", () => {
    const storage = fakeStorage();
    const sub = initNavigatorPrefs(storage);
    expect(navigatorPrefsService.getState().groupColorIntensity).toBe(1);
    storage.set("navigatorGroupColorIntensity", 2);
    storage.emit();
    expect(navigatorPrefsService.getState().groupColorIntensity).toBe(2);
    sub.dispose();
  });
});

describe("stepGroupColorIntensity", () => {
  it("steps by 0.2 in each direction", () => {
    expect(stepGroupColorIntensity(1, 1)).toBe(1.2);
    expect(stepGroupColorIntensity(1, -1)).toBe(0.8);
  });

  it("rounds away floating-point drift", () => {
    // 0.6 - 0.2 is 0.39999999999999997 without the round
    expect(stepGroupColorIntensity(0.6, -1)).toBe(0.4);
  });

  it("clamps to the slider bounds", () => {
    expect(stepGroupColorIntensity(2.4, 1)).toBe(2.4);
    expect(stepGroupColorIntensity(0.4, -1)).toBe(0.4);
  });
});
