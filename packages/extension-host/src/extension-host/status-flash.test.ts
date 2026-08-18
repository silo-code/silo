import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  clearStatusFlash,
  flashStatus,
  getStatusFlash,
  resetStatusFlashForTests,
  subscribeStatusFlash,
} from "./status-flash";

describe("status-flash", () => {
  beforeEach(() => {
    resetStatusFlashForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStatusFlashForTests();
  });

  it("shows a label then clears after dwell", () => {
    const ticks: (string | null)[] = [];
    const sub = subscribeStatusFlash(() => {
      ticks.push(getStatusFlash()?.label ?? null);
    });
    flashStatus({ label: "Silo is ready", dwellMs: 1000 });
    expect(getStatusFlash()?.label).toBe("Silo is ready");
    vi.advanceTimersByTime(1000);
    expect(getStatusFlash()).toBeNull();
    expect(ticks).toContain("Silo is ready");
    expect(ticks[ticks.length - 1]).toBeNull();
    sub.dispose();
  });

  it("replacing a flash resets the dwell", () => {
    flashStatus({ label: "One", dwellMs: 1000 });
    vi.advanceTimersByTime(800);
    flashStatus({ label: "Two", dwellMs: 1000 });
    expect(getStatusFlash()?.label).toBe("Two");
    vi.advanceTimersByTime(800);
    expect(getStatusFlash()?.label).toBe("Two");
    vi.advanceTimersByTime(200);
    expect(getStatusFlash()).toBeNull();
  });

  it("clearStatusFlash removes immediately", () => {
    flashStatus({ label: "X", dwellMs: 5000 });
    clearStatusFlash();
    expect(getStatusFlash()).toBeNull();
  });
});
