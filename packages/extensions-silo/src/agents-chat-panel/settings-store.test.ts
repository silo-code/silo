import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ExtensionStorage } from "@silo-code/sdk";
import {
  chatPanelSettingsService,
  clearChatPanelSettingsListeners,
  initChatPanelSettings,
  DEFAULT_CONFIRM_BEFORE_CLEAR,
} from "./settings-store";

/** Minimal `ExtensionStorage` stand-in: a map plus the change subscription the
 *  store re-reads on (real storage hydrates asynchronously). */
function fakeStorage(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  const subs = new Set<() => void>();
  const storage: ExtensionStorage = {
    get: <T>(key: string, fallback?: T) =>
      (values.has(key) ? values.get(key) : fallback) as T,
    set: (key: string, value: unknown) => {
      values.set(key, value);
      for (const s of subs) s();
      return Promise.resolve();
    },
    subscribe: (fn: () => void) => {
      subs.add(fn);
      return { dispose: () => subs.delete(fn) };
    },
  } as unknown as ExtensionStorage;
  return {
    storage,
    values,
    /** Simulate a value arriving after `activate()` already ran. */
    hydrate(key: string, value: unknown) {
      values.set(key, value);
      for (const s of subs) s();
    },
  };
}

beforeEach(() => {
  clearChatPanelSettingsListeners();
  chatPanelSettingsService.set({
    confirmBeforeClear: DEFAULT_CONFIRM_BEFORE_CLEAR,
  });
});

describe("chatPanelSettingsService", () => {
  it("confirms before clearing by default — deleting a transcript is opt-out, not opt-in", () => {
    expect(DEFAULT_CONFIRM_BEFORE_CLEAR).toBe(true);
    const { storage } = fakeStorage();
    initChatPanelSettings(storage);
    expect(chatPanelSettingsService.getState().confirmBeforeClear).toBe(true);
  });

  it("reads a persisted opt-out at init", () => {
    const { storage } = fakeStorage({ confirmBeforeClearSession: false });
    initChatPanelSettings(storage);
    expect(chatPanelSettingsService.getState().confirmBeforeClear).toBe(false);
  });

  it("writes through to storage and notifies subscribers", () => {
    const { storage, values } = fakeStorage();
    initChatPanelSettings(storage);
    const seen = vi.fn();
    chatPanelSettingsService.subscribe(seen);

    chatPanelSettingsService.set({ confirmBeforeClear: false });

    expect(values.get("confirmBeforeClearSession")).toBe(false);
    expect(seen).toHaveBeenCalledWith({ confirmBeforeClear: false });
  });

  it("picks up a value that hydrates after activate()", () => {
    const { storage, hydrate } = fakeStorage();
    initChatPanelSettings(storage);
    const seen = vi.fn();
    chatPanelSettingsService.subscribe(seen);

    hydrate("confirmBeforeClearSession", false);

    expect(chatPanelSettingsService.getState().confirmBeforeClear).toBe(false);
    expect(seen).toHaveBeenCalledWith({ confirmBeforeClear: false });
  });

  it("falls back to the default on garbage in storage", () => {
    const { storage } = fakeStorage({ confirmBeforeClearSession: "nope" });
    initChatPanelSettings(storage);
    expect(chatPanelSettingsService.getState().confirmBeforeClear).toBe(true);
  });

  it("disposing init stops re-reading storage", () => {
    const { storage, hydrate } = fakeStorage();
    const sub = initChatPanelSettings(storage);
    sub.dispose();

    hydrate("confirmBeforeClearSession", false);

    expect(chatPanelSettingsService.getState().confirmBeforeClear).toBe(true);
  });
});
