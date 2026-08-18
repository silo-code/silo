import { describe, expect, it, beforeEach } from "vitest";
import {
  clearBusyStatus,
  getBusyStatusSnapshot,
  resetBusyStatusForTests,
  setBusyStatus,
  subscribeBusyStatus,
} from "./busy-status";

describe("busy-status registry", () => {
  beforeEach(() => {
    resetBusyStatusForTests();
  });

  it("set + clear drive the snapshot and notify subscribers", () => {
    let ticks = 0;
    const sub = subscribeBusyStatus(() => {
      ticks++;
    });
    const d = setBusyStatus({ id: "t.restore", label: "Restoring terminals…" });
    const snap = getBusyStatusSnapshot();
    expect(snap.summary).toEqual({
      primary: expect.objectContaining({
        id: "t.restore",
        label: "Restoring terminals…",
        urgency: "normal",
      }),
      count: 1,
    });
    expect(ticks).toBeGreaterThanOrEqual(1);
    // Stable identity between reads (useSyncExternalStore contract).
    expect(getBusyStatusSnapshot()).toBe(snap);

    d.dispose();
    expect(getBusyStatusSnapshot().summary.count).toBe(0);
    expect(getBusyStatusSnapshot()).not.toBe(snap);
    sub.dispose();
  });

  it("replace by id updates label and bumps updatedAt for tie-break", () => {
    setBusyStatus({ id: "a", label: "One" });
    const firstAt = getBusyStatusSnapshot().entries[0]!.updatedAt;
    setBusyStatus({ id: "b", label: "Two" });
    setBusyStatus({ id: "a", label: "One again" });
    const snap = getBusyStatusSnapshot();
    expect(snap.summary.primary?.id).toBe("a");
    expect(snap.summary.primary?.label).toBe("One again");
    expect(snap.summary.primary!.updatedAt).toBeGreaterThanOrEqual(firstAt);
    expect(snap.summary.count).toBe(2);
    clearBusyStatus("a");
    clearBusyStatus("b");
  });
});
