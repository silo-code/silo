import { describe, it, expect, beforeEach } from "vitest";
import type { AgentInfo, ExtensionStorage } from "@silo-code/sdk";
import {
  getDoneSince,
  initDoneSince,
  recordDoneSince,
  resetDoneSince,
} from "./done-since";

/** In-memory ExtensionStorage stand-in that counts writes, so the tests can
 * assert the steady state doesn't persist on every snapshot. */
function fakeStorage(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  let writes = 0;
  let listener: (() => void) | null = null;
  const storage: ExtensionStorage & { writes(): number; hydrate(): void } = {
    get: ((key: string, fallback?: unknown) =>
      data.has(key) ? data.get(key) : fallback) as ExtensionStorage["get"],
    set(key, value) {
      writes++;
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
    writes: () => writes,
    hydrate() {
      listener?.();
    },
  };
  return storage;
}

/** An agent `sectionFor` classifies as "done": idle and acknowledged. */
function doneAgent(terminalId: string): AgentInfo {
  return {
    terminalId,
    workspaceId: "w1",
    kind: "claude",
    isAgent: true,
    activity: "idle",
    needsAttention: false,
    stale: false,
  };
}

function workingAgent(terminalId: string): AgentInfo {
  return { ...doneAgent(terminalId), activity: "working" };
}

// The module holds its state in a singleton (it's extension-scoped by
// design), so each test starts from a clean one.
beforeEach(() => resetDoneSince());

describe("initDoneSince", () => {
  it("seeds from persisted storage", () => {
    initDoneSince(
      fakeStorage({ agentsDoneSince: { t1: "2026-01-01T00:00:00Z" } }),
    );
    expect(getDoneSince().get("t1")).toBe("2026-01-01T00:00:00Z");
  });

  it("starts empty when nothing is persisted", () => {
    initDoneSince(fakeStorage());
    expect(getDoneSince().size).toBe(0);
  });

  it("re-reads when storage notifies after async hydrate", () => {
    const storage = fakeStorage();
    initDoneSince(storage);
    expect(getDoneSince().size).toBe(0);
    storage.set("agentsDoneSince", { t1: "2026-01-01T00:00:00Z" });
    storage.hydrate();
    expect(getDoneSince().get("t1")).toBe("2026-01-01T00:00:00Z");
  });
});

describe("recordDoneSince", () => {
  it("stamps a newly done agent and persists it", () => {
    const storage = fakeStorage();
    initDoneSince(storage);
    recordDoneSince([doneAgent("t1")]);
    expect(getDoneSince().has("t1")).toBe(true);
    expect(storage.get<Record<string, string>>("agentsDoneSince")?.t1).toBe(
      getDoneSince().get("t1"),
    );
  });

  it("keeps an existing stamp rather than refreshing it", () => {
    initDoneSince(
      fakeStorage({ agentsDoneSince: { t1: "2026-01-01T00:00:00Z" } }),
    );
    recordDoneSince([doneAgent("t1")]);
    expect(getDoneSince().get("t1")).toBe("2026-01-01T00:00:00Z");
  });

  it("drops a row that is no longer done", () => {
    initDoneSince(
      fakeStorage({ agentsDoneSince: { t1: "2026-01-01T00:00:00Z" } }),
    );
    recordDoneSince([workingAgent("t1")]);
    expect(getDoneSince().has("t1")).toBe(false);
  });

  it("drops a row whose terminal the host no longer reports", () => {
    initDoneSince(
      fakeStorage({ agentsDoneSince: { t1: "2026-01-01T00:00:00Z" } }),
    );
    recordDoneSince([]);
    expect(getDoneSince().size).toBe(0);
  });

  it("does not write when the contents are unchanged", () => {
    const storage = fakeStorage();
    initDoneSince(storage);
    recordDoneSince([doneAgent("t1")]);
    const afterFirst = storage.writes();
    recordDoneSince([doneAgent("t1")]);
    recordDoneSince([doneAgent("t1")]);
    expect(storage.writes()).toBe(afterFirst);
  });

  it("tracks each terminal independently", () => {
    initDoneSince(
      fakeStorage({ agentsDoneSince: { t1: "2026-01-01T00:00:00Z" } }),
    );
    recordDoneSince([doneAgent("t1"), doneAgent("t2")]);
    expect(getDoneSince().get("t1")).toBe("2026-01-01T00:00:00Z");
    expect(getDoneSince().get("t2")).not.toBe("2026-01-01T00:00:00Z");
    expect(getDoneSince().size).toBe(2);
  });
});
