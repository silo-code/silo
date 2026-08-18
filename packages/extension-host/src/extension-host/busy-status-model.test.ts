import { describe, expect, it } from "vitest";
import {
  cmpBusyStatus,
  selectPrimaryBusyStatus,
  sortBusyStatusForPopover,
  summarizeBusyStatus,
  type BusyStatusEntry,
} from "./busy-status-model";

function entry(
  partial: Partial<BusyStatusEntry> & Pick<BusyStatusEntry, "id" | "label">,
): BusyStatusEntry {
  return {
    urgency: "normal",
    updatedAt: 0,
    ...partial,
  };
}

describe("selectPrimaryBusyStatus", () => {
  it("returns null when empty", () => {
    expect(selectPrimaryBusyStatus([])).toBeNull();
  });

  it("returns the only entry", () => {
    const a = entry({ id: "a", label: "A", updatedAt: 1 });
    expect(selectPrimaryBusyStatus([a])).toBe(a);
  });

  it("prefers high urgency over newer normal", () => {
    const normal = entry({
      id: "n",
      label: "Normal",
      urgency: "normal",
      updatedAt: 100,
    });
    const high = entry({
      id: "h",
      label: "High",
      urgency: "high",
      updatedAt: 1,
    });
    expect(selectPrimaryBusyStatus([normal, high])).toBe(high);
  });

  it("within the same urgency prefers most recently updated", () => {
    const older = entry({ id: "a", label: "A", updatedAt: 10 });
    const newer = entry({ id: "b", label: "B", updatedAt: 20 });
    expect(selectPrimaryBusyStatus([older, newer])).toBe(newer);
  });
});

describe("summarizeBusyStatus", () => {
  it("exposes count for the badge (hidden by UI when count is 1)", () => {
    const a = entry({ id: "a", label: "A", updatedAt: 1 });
    const b = entry({ id: "b", label: "B", updatedAt: 2 });
    expect(summarizeBusyStatus([a])).toEqual({ primary: a, count: 1 });
    expect(summarizeBusyStatus([a, b])).toEqual({ primary: b, count: 2 });
  });
});

describe("sortBusyStatusForPopover", () => {
  it("lists high before normal, then newer, then id", () => {
    const n1 = entry({ id: "n1", label: "N1", updatedAt: 50 });
    const n2 = entry({ id: "n2", label: "N2", updatedAt: 40 });
    const h = entry({
      id: "h",
      label: "H",
      urgency: "high",
      updatedAt: 1,
    });
    expect(sortBusyStatusForPopover([n2, h, n1]).map((e) => e.id)).toEqual([
      "h",
      "n1",
      "n2",
    ]);
  });
});

describe("cmpBusyStatus", () => {
  it("orders high above normal", () => {
    const high = entry({ id: "h", label: "H", urgency: "high", updatedAt: 0 });
    const normal = entry({
      id: "n",
      label: "N",
      urgency: "normal",
      updatedAt: 99,
    });
    expect(cmpBusyStatus(high, normal)).toBeGreaterThan(0);
    expect(cmpBusyStatus(normal, high)).toBeLessThan(0);
  });
});
