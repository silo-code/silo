import { describe, it, expect, beforeEach } from "vitest";
import type { ExtensionStorage } from "@silo-code/sdk";
import {
  settingsService,
  initSettings,
  clearSettingsListeners,
  SOUND_IDS,
  DEFAULT_SHOW_WS_STATUS_ROWS,
  DEFAULT_STALE_DONE_ENABLED,
  DEFAULT_STALE_DONE_HOURS,
  DEFAULT_STALE_HOVER_EXPAND_ENABLED,
  type FocusBehavior,
} from "./settings-store";

/** In-memory ExtensionStorage stand-in, mirroring the host's real contract. */
function fakeStorage(
  initial: Record<string, unknown> = {},
): ExtensionStorage & {
  emit(): void;
} {
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

// settings-store.ts holds its state in a module-level singleton (mirrors the
// host's own ReactiveService pattern), so each test pins a known starting
// value via a throwaway storage before exercising the behavior under test.
function resetTo(focusBehavior: FocusBehavior) {
  clearSettingsListeners();
  initSettings(fakeStorage({ focusBehavior })).dispose();
}

describe("agent-monitor settings persistence", () => {
  beforeEach(() => {
    resetTo("none");
  });

  it('defaults to "clear" with empty storage', () => {
    resetTo("clear"); // restore module to compiled default before testing empty storage
    const storage = fakeStorage();
    const sub = initSettings(storage);
    expect(settingsService.getState().focusBehavior).toBe("clear");
    sub.dispose();
  });

  it("hydrates from a value already persisted (restart case)", () => {
    const storage = fakeStorage({ focusBehavior: "hide" });
    const sub = initSettings(storage);
    expect(settingsService.getState().focusBehavior).toBe("hide");
    sub.dispose();
  });

  it("coerces an invalid stored value to the default", () => {
    // e.g. a boolean left over from an older settings shape, or garbage.
    const storage = fakeStorage({ focusBehavior: true });
    const sub = initSettings(storage);
    expect(settingsService.getState().focusBehavior).toBe("clear");
    sub.dispose();
  });

  it("persists a change through settingsService.set", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    settingsService.set({ focusBehavior: "hide" });
    expect(storage.get<string>("focusBehavior")).toBe("hide");
    sub.dispose();
  });

  it("picks up a value that arrives after activation (async hydration)", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    expect(settingsService.getState().focusBehavior).toBe("none");
    storage.set("focusBehavior", "hide");
    storage.emit();
    expect(settingsService.getState().focusBehavior).toBe("hide");
    sub.dispose();
  });

  it("dispose stops reacting to further storage changes", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    sub.dispose();
    storage.set("focusBehavior", "hide");
    storage.emit();
    expect(settingsService.getState().focusBehavior).toBe("none");
  });
});

describe("agent-monitor sound settings", () => {
  beforeEach(() => {
    clearSettingsListeners();
    initSettings(
      fakeStorage({ soundEnabled: false, soundId: "chime" }),
    ).dispose();
  });

  it('defaults to enabled with "chime" when nothing is persisted', () => {
    // Restore module to compiled defaults before testing empty storage —
    // initSettings falls back to the in-memory singleton when a key is missing.
    initSettings(
      fakeStorage({ soundEnabled: true, soundId: "chime" }),
    ).dispose();
    const storage = fakeStorage();
    const sub = initSettings(storage);
    expect(settingsService.getState().soundEnabled).toBe(true);
    expect(settingsService.getState().soundId).toBe("chime");
    sub.dispose();
  });

  it("hydrates a persisted enabled/soundId pair", () => {
    const storage = fakeStorage({ soundEnabled: true, soundId: "sparkle" });
    const sub = initSettings(storage);
    expect(settingsService.getState().soundEnabled).toBe(true);
    expect(settingsService.getState().soundId).toBe("sparkle");
    sub.dispose();
  });

  it("coerces an invalid persisted soundId to the default", () => {
    const storage = fakeStorage({ soundId: "not-a-real-sound" });
    const sub = initSettings(storage);
    expect(settingsService.getState().soundId).toBe("chime");
    sub.dispose();
  });

  it.each(["press", "release", "toggle"])(
    "coerces the excluded UI-feedback sound %j to the default",
    (soundId) => {
      const storage = fakeStorage({ soundId });
      const sub = initSettings(storage);
      expect(settingsService.getState().soundId).toBe("chime");
      sub.dispose();
    },
  );

  it("coerces a non-boolean persisted soundEnabled to the default", () => {
    const storage = fakeStorage({ soundEnabled: "yes" });
    const sub = initSettings(storage);
    expect(settingsService.getState().soundEnabled).toBe(true);
    sub.dispose();
  });

  it("persists soundEnabled/soundId through settingsService.set", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    settingsService.set({ soundEnabled: true, soundId: "bloom" });
    expect(storage.get<boolean>("soundEnabled")).toBe(true);
    expect(storage.get<string>("soundId")).toBe("bloom");
    sub.dispose();
  });

  it("excludes the UI-feedback sounds from the offered list", () => {
    expect(SOUND_IDS).not.toContain("press");
    expect(SOUND_IDS).not.toContain("release");
    expect(SOUND_IDS).not.toContain("toggle");
    expect(SOUND_IDS).toContain("chime");
  });
});

describe("agent-monitor iconMode setting", () => {
  beforeEach(() => {
    clearSettingsListeners();
    initSettings(fakeStorage({ agentsIconMode: "color" })).dispose();
  });

  it('defaults to "color" with empty storage', () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    expect(settingsService.getState().iconMode).toBe("color");
    sub.dispose();
  });

  it('hydrates a persisted "monotone" value', () => {
    const storage = fakeStorage({ agentsIconMode: "monotone" });
    const sub = initSettings(storage);
    expect(settingsService.getState().iconMode).toBe("monotone");
    sub.dispose();
  });

  it('hydrates a persisted "none" value', () => {
    const storage = fakeStorage({ agentsIconMode: "none" });
    const sub = initSettings(storage);
    expect(settingsService.getState().iconMode).toBe("none");
    sub.dispose();
  });

  it("coerces an invalid persisted value to the default", () => {
    const storage = fakeStorage({ agentsIconMode: "nonsense" });
    const sub = initSettings(storage);
    expect(settingsService.getState().iconMode).toBe("color");
    sub.dispose();
  });

  it("persists a change through settingsService.set", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    settingsService.set({ iconMode: "monotone" });
    expect(storage.get<string>("agentsIconMode")).toBe("monotone");
    sub.dispose();
  });
});

describe("agent-monitor groupBy setting", () => {
  beforeEach(() => {
    clearSettingsListeners();
    initSettings(fakeStorage({ agentsGroupBy: "status" })).dispose();
  });

  it('defaults to "age" with empty storage', () => {
    // Restore module state to the compiled default before testing empty
    // storage — `beforeEach` above seeds "status", and `read()` falls back to
    // the *current* in-memory value when storage has nothing persisted, so
    // without this reset the test would just reflect that seed rather than
    // DEFAULT_GROUP_BY. Mirrors the `resetTo("clear")` pattern for
    // focusBehavior above.
    initSettings(fakeStorage({ agentsGroupBy: "age" })).dispose();
    const storage = fakeStorage();
    const sub = initSettings(storage);
    expect(settingsService.getState().groupBy).toBe("age");
    sub.dispose();
  });

  it('hydrates a persisted "workspace" value (restart case)', () => {
    const storage = fakeStorage({ agentsGroupBy: "workspace" });
    const sub = initSettings(storage);
    expect(settingsService.getState().groupBy).toBe("workspace");
    sub.dispose();
  });

  it("coerces an invalid persisted value to the default", () => {
    const storage = fakeStorage({ agentsGroupBy: "by-project" });
    const sub = initSettings(storage);
    expect(settingsService.getState().groupBy).toBe("age");
    sub.dispose();
  });

  it("persists a change through settingsService.set", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    settingsService.set({ groupBy: "workspace" });
    expect(storage.get<string>("agentsGroupBy")).toBe("workspace");
    sub.dispose();
  });

  it("notifies subscribers so the open view regroups", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    const seen: string[] = [];
    const listener = settingsService.subscribe((s) => seen.push(s.groupBy));
    settingsService.set({ groupBy: "workspace" });
    expect(seen).toEqual(["workspace"]);
    listener.dispose();
    sub.dispose();
  });
});

describe("agent-monitor showWorkspaceStatusRows setting", () => {
  beforeEach(() => {
    clearSettingsListeners();
    initSettings(
      fakeStorage({
        agentsShowWorkspaceStatusRows: DEFAULT_SHOW_WS_STATUS_ROWS,
      }),
    ).dispose();
  });

  it(`defaults to ${DEFAULT_SHOW_WS_STATUS_ROWS} with empty storage`, () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    expect(settingsService.getState().showWorkspaceStatusRows).toBe(
      DEFAULT_SHOW_WS_STATUS_ROWS,
    );
    sub.dispose();
  });

  it("hydrates a persisted false value (restart case)", () => {
    const storage = fakeStorage({ agentsShowWorkspaceStatusRows: false });
    const sub = initSettings(storage);
    expect(settingsService.getState().showWorkspaceStatusRows).toBe(false);
    sub.dispose();
  });

  it("coerces a non-boolean persisted value to the default", () => {
    const storage = fakeStorage({ agentsShowWorkspaceStatusRows: "nope" });
    const sub = initSettings(storage);
    expect(settingsService.getState().showWorkspaceStatusRows).toBe(
      DEFAULT_SHOW_WS_STATUS_ROWS,
    );
    sub.dispose();
  });

  it("persists a change through settingsService.set", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    settingsService.set({ showWorkspaceStatusRows: false });
    expect(storage.get<boolean>("agentsShowWorkspaceStatusRows")).toBe(false);
    sub.dispose();
  });

  it("notifies subscribers so the workspace rows re-render", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    const seen: boolean[] = [];
    const listener = settingsService.subscribe((s) =>
      seen.push(s.showWorkspaceStatusRows),
    );
    settingsService.set({ showWorkspaceStatusRows: false });
    expect(seen).toEqual([false]);
    listener.dispose();
    sub.dispose();
  });
});

describe("agent-monitor staleDoneEnabled setting", () => {
  beforeEach(() => {
    clearSettingsListeners();
    initSettings(
      fakeStorage({ agentsStaleDoneEnabled: DEFAULT_STALE_DONE_ENABLED }),
    ).dispose();
  });

  it(`defaults to ${DEFAULT_STALE_DONE_ENABLED} with empty storage`, () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    expect(settingsService.getState().staleDoneEnabled).toBe(
      DEFAULT_STALE_DONE_ENABLED,
    );
    sub.dispose();
  });

  it("hydrates a persisted false value", () => {
    const storage = fakeStorage({ agentsStaleDoneEnabled: false });
    const sub = initSettings(storage);
    expect(settingsService.getState().staleDoneEnabled).toBe(false);
    sub.dispose();
  });

  it("coerces a non-boolean persisted value to the default", () => {
    const storage = fakeStorage({ agentsStaleDoneEnabled: "nope" });
    const sub = initSettings(storage);
    expect(settingsService.getState().staleDoneEnabled).toBe(
      DEFAULT_STALE_DONE_ENABLED,
    );
    sub.dispose();
  });

  it("persists a change through settingsService.set", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    settingsService.set({ staleDoneEnabled: false });
    expect(storage.get<boolean>("agentsStaleDoneEnabled")).toBe(false);
    sub.dispose();
  });
});

describe("agent-monitor staleDoneHours setting", () => {
  beforeEach(() => {
    clearSettingsListeners();
    initSettings(
      fakeStorage({ agentsStaleDoneHours: DEFAULT_STALE_DONE_HOURS }),
    ).dispose();
  });

  it(`defaults to ${DEFAULT_STALE_DONE_HOURS} with empty storage`, () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    expect(settingsService.getState().staleDoneHours).toBe(
      DEFAULT_STALE_DONE_HOURS,
    );
    sub.dispose();
  });

  it("hydrates a persisted value", () => {
    const storage = fakeStorage({ agentsStaleDoneHours: 12 });
    const sub = initSettings(storage);
    expect(settingsService.getState().staleDoneHours).toBe(12);
    sub.dispose();
  });

  it("coerces the minimum boundary value (1) as valid", () => {
    const storage = fakeStorage({ agentsStaleDoneHours: 1 });
    const sub = initSettings(storage);
    expect(settingsService.getState().staleDoneHours).toBe(1);
    sub.dispose();
  });

  it("coerces a value below the minimum to the default", () => {
    const storage = fakeStorage({ agentsStaleDoneHours: 0 });
    const sub = initSettings(storage);
    expect(settingsService.getState().staleDoneHours).toBe(
      DEFAULT_STALE_DONE_HOURS,
    );
    sub.dispose();
  });

  it("coerces a fractional value to the default", () => {
    const storage = fakeStorage({ agentsStaleDoneHours: 4.5 });
    const sub = initSettings(storage);
    expect(settingsService.getState().staleDoneHours).toBe(
      DEFAULT_STALE_DONE_HOURS,
    );
    sub.dispose();
  });

  it("coerces a non-number persisted value to the default", () => {
    const storage = fakeStorage({ agentsStaleDoneHours: "8" });
    const sub = initSettings(storage);
    expect(settingsService.getState().staleDoneHours).toBe(
      DEFAULT_STALE_DONE_HOURS,
    );
    sub.dispose();
  });

  it("persists a change through settingsService.set", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    settingsService.set({ staleDoneHours: 6 });
    expect(storage.get<number>("agentsStaleDoneHours")).toBe(6);
    sub.dispose();
  });
});

describe("agent-monitor staleHoverExpandEnabled setting", () => {
  beforeEach(() => {
    clearSettingsListeners();
    initSettings(
      fakeStorage({
        agentsStaleHoverExpandEnabled: DEFAULT_STALE_HOVER_EXPAND_ENABLED,
      }),
    ).dispose();
  });

  it(`defaults to ${DEFAULT_STALE_HOVER_EXPAND_ENABLED} with empty storage`, () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    expect(settingsService.getState().staleHoverExpandEnabled).toBe(
      DEFAULT_STALE_HOVER_EXPAND_ENABLED,
    );
    sub.dispose();
  });

  it("hydrates a persisted true value", () => {
    const storage = fakeStorage({ agentsStaleHoverExpandEnabled: true });
    const sub = initSettings(storage);
    expect(settingsService.getState().staleHoverExpandEnabled).toBe(true);
    sub.dispose();
  });

  it("coerces a non-boolean persisted value to the default", () => {
    const storage = fakeStorage({ agentsStaleHoverExpandEnabled: "nope" });
    const sub = initSettings(storage);
    expect(settingsService.getState().staleHoverExpandEnabled).toBe(
      DEFAULT_STALE_HOVER_EXPAND_ENABLED,
    );
    sub.dispose();
  });

  it("persists a change through settingsService.set", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    settingsService.set({ staleHoverExpandEnabled: true });
    expect(storage.get<boolean>("agentsStaleHoverExpandEnabled")).toBe(true);
    sub.dispose();
  });
});
