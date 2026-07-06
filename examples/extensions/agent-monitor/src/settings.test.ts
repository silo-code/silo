import { describe, it, expect, beforeEach } from "vitest";
import type { ExtensionStorage } from "@silo-code/sdk";
import {
  settingsService,
  initSettings,
  clearSettingsListeners,
} from "./settings";

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

// settings.ts holds its state in a module-level singleton (mirrors the host's
// own ReactiveService pattern), so each test pins a known starting value via
// a throwaway storage before exercising the behavior under test.
function resetTo(hideStatusWhenFocused: boolean) {
  clearSettingsListeners();
  initSettings(fakeStorage({ hideStatusWhenFocused })).dispose();
}

describe("agent-monitor settings persistence", () => {
  beforeEach(() => {
    resetTo(false);
  });

  it("defaults to false with empty storage", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    expect(settingsService.getState().hideStatusWhenFocused).toBe(false);
    sub.dispose();
  });

  it("hydrates from a value already persisted (restart case)", () => {
    const storage = fakeStorage({ hideStatusWhenFocused: true });
    const sub = initSettings(storage);
    expect(settingsService.getState().hideStatusWhenFocused).toBe(true);
    sub.dispose();
  });

  it("persists a change through settingsService.set", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    settingsService.set({ hideStatusWhenFocused: true });
    expect(storage.get<boolean>("hideStatusWhenFocused")).toBe(true);
    sub.dispose();
  });

  it("picks up a value that arrives after activation (async hydration)", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    expect(settingsService.getState().hideStatusWhenFocused).toBe(false);
    storage.set("hideStatusWhenFocused", true);
    storage.emit();
    expect(settingsService.getState().hideStatusWhenFocused).toBe(true);
    sub.dispose();
  });

  it("dispose stops reacting to further storage changes", () => {
    const storage = fakeStorage();
    const sub = initSettings(storage);
    sub.dispose();
    storage.set("hideStatusWhenFocused", true);
    storage.emit();
    expect(settingsService.getState().hideStatusWhenFocused).toBe(false);
  });
});
