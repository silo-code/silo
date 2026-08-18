import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  beginStartupStatus,
  markStartupExtensionsReady,
  markStartupHydrated,
  markStartupLayoutReady,
  resetStartupStatusForTests,
  startupTerminalRestoreBegin,
  startupTerminalRestoreEnd,
} from "./startup-status";
import { getBusyStatusSnapshot, resetBusyStatusForTests } from "./busy-status";
import { getStatusFlash, resetStatusFlashForTests } from "./status-flash";
import {
  STARTUP_BUSY_ID,
  STARTUP_READY_DWELL_MS,
} from "./startup-status-model";

describe("startup-status", () => {
  beforeEach(() => {
    resetStartupStatusForTests();
    resetBusyStatusForTests();
    resetStatusFlashForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStartupStatusForTests();
    resetBusyStatusForTests();
    resetStatusFlashForTests();
  });

  it("walks hydrate → extensions → layout → ready flash when no terminals", () => {
    beginStartupStatus();
    expect(getBusyStatusSnapshot().summary.primary?.label).toBe(
      "Starting Silo…",
    );

    markStartupHydrated();
    expect(getBusyStatusSnapshot().summary.primary?.label).toBe(
      "Loading extensions…",
    );

    markStartupExtensionsReady();
    expect(getBusyStatusSnapshot().summary.primary?.label).toBe(
      "Restoring workspace…",
    );

    markStartupLayoutReady(0);
    expect(
      getBusyStatusSnapshot().entries.find((e) => e.id === STARTUP_BUSY_ID),
    ).toBeUndefined();
    expect(getStatusFlash()?.label).toBe("Silo is ready");

    vi.advanceTimersByTime(STARTUP_READY_DWELL_MS);
    expect(getStatusFlash()).toBeNull();
  });

  it("waits for terminal restores before ready flash", () => {
    beginStartupStatus();
    markStartupHydrated();
    markStartupExtensionsReady();
    markStartupLayoutReady(2);
    expect(getBusyStatusSnapshot().summary.primary?.label).toBe(
      "Restoring terminals…",
    );
    expect(getStatusFlash()).toBeNull();

    startupTerminalRestoreBegin();
    startupTerminalRestoreBegin();
    startupTerminalRestoreEnd();
    expect(getBusyStatusSnapshot().summary.primary?.label).toBe(
      "Restoring terminals…",
    );

    startupTerminalRestoreEnd();
    expect(
      getBusyStatusSnapshot().entries.find((e) => e.id === STARTUP_BUSY_ID),
    ).toBeUndefined();
    expect(getStatusFlash()?.label).toBe("Silo is ready");
  });
});
