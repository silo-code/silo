import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Disposable, ExtensionStorage } from "@silo-code/sdk";
import {
  VISITED_KEY,
  bindExtensionsOnboarding,
  extensionsOnboarding,
  markVisited,
  readVisited,
} from "./extensions-onboarding";

function mockStorage(
  initial: Record<string, unknown> = {},
): ExtensionStorage & {
  bag: Record<string, unknown>;
  listeners: Set<() => void>;
} {
  const bag = { ...initial };
  const listeners = new Set<() => void>();
  return {
    bag,
    listeners,
    get<T>(key: string, fallback?: T): T | undefined {
      if (key in bag) return bag[key] as T;
      return fallback;
    },
    set(key: string, value: unknown) {
      if (value === undefined) delete bag[key];
      else bag[key] = value;
      for (const l of listeners) l();
    },
    keys() {
      return Object.keys(bag);
    },
    subscribe(listener: () => void): Disposable {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
  };
}

beforeEach(() => {
  extensionsOnboarding.visited = false;
});

describe("readVisited / markVisited", () => {
  it("unset key means not visited", () => {
    expect(readVisited(mockStorage())).toBe(false);
  });

  it("truthy non-true values do not count as visited", () => {
    expect(readVisited(mockStorage({ [VISITED_KEY]: 1 }))).toBe(false);
    expect(readVisited(mockStorage({ [VISITED_KEY]: "true" }))).toBe(false);
  });

  it("markVisited sets the flag and is idempotent", () => {
    const storage = mockStorage();
    const set = vi.spyOn(storage, "set");

    markVisited(storage);
    expect(readVisited(storage)).toBe(true);
    expect(storage.bag[VISITED_KEY]).toBe(true);
    expect(set).toHaveBeenCalledTimes(1);

    markVisited(storage);
    expect(set).toHaveBeenCalledTimes(1);
  });
});

describe("bindExtensionsOnboarding", () => {
  it("syncs the proxy from storage and updates on subscribe", () => {
    const storage = mockStorage({ [VISITED_KEY]: true });
    const sub = bindExtensionsOnboarding(storage);
    expect(extensionsOnboarding.visited).toBe(true);

    storage.set(VISITED_KEY, undefined);
    expect(extensionsOnboarding.visited).toBe(false);

    markVisited(storage);
    expect(extensionsOnboarding.visited).toBe(true);

    sub.dispose();
    storage.set(VISITED_KEY, undefined);
    // Unbound — proxy no longer tracks storage.
    expect(extensionsOnboarding.visited).toBe(true);
  });
});
