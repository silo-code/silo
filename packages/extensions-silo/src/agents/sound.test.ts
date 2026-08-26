import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionStorage } from "@silo-code/sdk";
import { clearSettingsListeners, initSettings } from "./settings-store";
import { maybePlayTransitionSound, previewSound } from "./sound";

const playMock = vi.hoisted(() => vi.fn());
vi.mock("./synth", () => ({
  play: playMock,
  sounds: [
    "chime",
    "sparkle",
    "droplet",
    "bloom",
    "whisper",
    "tick",
    "press",
    "release",
    "toggle",
    "success",
    "error",
    "page",
    "loading",
    "ready",
  ],
}));

/** In-memory ExtensionStorage stand-in, mirroring settings.test.ts's. */
function fakeStorage(initial: Record<string, unknown> = {}): ExtensionStorage {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    get: ((key: string, fallback?: unknown) =>
      data.has(key) ? data.get(key) : fallback) as ExtensionStorage["get"],
    set(key, value) {
      if (value === undefined) data.delete(key);
      else data.set(key, value);
    },
    keys: () => [...data.keys()],
    subscribe: () => ({ dispose: () => {} }),
  };
}

// sound.ts's debounce timestamp is module-level state, so each test below
// uses its own well-separated block of timestamps rather than resetting it
// directly — cheaper than exporting a test-only reset hook.
describe("maybePlayTransitionSound", () => {
  beforeEach(() => {
    playMock.mockClear();
    clearSettingsListeners();
    initSettings(
      fakeStorage({ soundEnabled: true, soundId: "chime" }),
    ).dispose();
  });

  it("does nothing when sound is disabled", () => {
    initSettings(
      fakeStorage({ soundEnabled: false, soundId: "chime" }),
    ).dispose();
    maybePlayTransitionSound(10_000);
    expect(playMock).not.toHaveBeenCalled();
  });

  it("plays the configured sound when enabled", () => {
    maybePlayTransitionSound(20_000);
    expect(playMock).toHaveBeenCalledWith("chime");
  });

  it("debounces a second call inside the window", () => {
    maybePlayTransitionSound(30_000);
    maybePlayTransitionSound(30_200);
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("plays again once the debounce window has passed", () => {
    maybePlayTransitionSound(40_000);
    maybePlayTransitionSound(40_800);
    expect(playMock).toHaveBeenCalledTimes(2);
  });
});

describe("previewSound", () => {
  beforeEach(() => playMock.mockClear());

  it("always plays, bypassing the enabled flag", () => {
    clearSettingsListeners();
    initSettings(
      fakeStorage({ soundEnabled: false, soundId: "chime" }),
    ).dispose();
    previewSound("bloom");
    expect(playMock).toHaveBeenCalledWith("bloom");
  });
});
