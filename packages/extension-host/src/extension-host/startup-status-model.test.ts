import { describe, it, expect } from "vitest";
import {
  startupBusyLabel,
  startupTerminalsSettled,
  type StartupGateState,
} from "./startup-status-model";

function gates(partial: Partial<StartupGateState> = {}): StartupGateState {
  return {
    hydrated: false,
    extensionsReady: false,
    layoutReady: false,
    terminalsExpected: 0,
    terminalsBegun: 0,
    terminalsInFlight: 0,
    readyShown: false,
    ...partial,
  };
}

describe("startupBusyLabel", () => {
  it("starts with Starting Silo… until either gate flips", () => {
    expect(startupBusyLabel(gates())).toBe("Starting Silo…");
  });

  it("shows Loading workspaces… when only extensions are ready", () => {
    expect(startupBusyLabel(gates({ extensionsReady: true }))).toBe(
      "Loading workspaces…",
    );
  });

  it("shows Loading extensions… when only hydrated", () => {
    expect(startupBusyLabel(gates({ hydrated: true }))).toBe(
      "Loading extensions…",
    );
  });

  it("shows Restoring workspace… after both boot gates", () => {
    expect(
      startupBusyLabel(gates({ hydrated: true, extensionsReady: true })),
    ).toBe("Restoring workspace…");
  });

  it("shows Restoring terminals… while the cohort is outstanding", () => {
    expect(
      startupBusyLabel(
        gates({
          hydrated: true,
          extensionsReady: true,
          layoutReady: true,
          terminalsExpected: 2,
          terminalsBegun: 1,
          terminalsInFlight: 1,
        }),
      ),
    ).toBe("Restoring terminals…");
  });

  it("waits for first attach when expected > 0 but none begun yet", () => {
    expect(
      startupBusyLabel(
        gates({
          hydrated: true,
          extensionsReady: true,
          layoutReady: true,
          terminalsExpected: 3,
        }),
      ),
    ).toBe("Restoring terminals…");
  });

  it("returns null once terminals settle (ready is a status flash)", () => {
    const done = gates({
      hydrated: true,
      extensionsReady: true,
      layoutReady: true,
      terminalsExpected: 2,
      terminalsBegun: 2,
      terminalsInFlight: 0,
    });
    expect(startupTerminalsSettled(done)).toBe(true);
    expect(startupBusyLabel(done)).toBeNull();
  });

  it("returns null when no terminals expected after layout", () => {
    expect(
      startupBusyLabel(
        gates({
          hydrated: true,
          extensionsReady: true,
          layoutReady: true,
          terminalsExpected: 0,
        }),
      ),
    ).toBeNull();
  });
});
