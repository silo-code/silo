/**
 * Pure labels / phase rules for host startup StatusBar copy (RFC 0026).
 * Side effects (busyStatus / flashStatus) live in {@link ./startup-status}.
 */

export const STARTUP_BUSY_ID = "host.startup";

/** How long the host status flash keeps "Silo is ready". */
export const STARTUP_READY_DWELL_MS = 3_000;

/** Wall-clock cap waiting for terminal restores after layout. */
export const STARTUP_TERMINALS_BUDGET_MS = 10_000;

export type StartupGateState = {
  hydrated: boolean;
  extensionsReady: boolean;
  layoutReady: boolean;
  /** Terminals with a sessionId in the active workspace at layout time. */
  terminalsExpected: number;
  /** Attach begins observed since layout (restore path only). */
  terminalsBegun: number;
  terminalsInFlight: number;
  /** True once we've handed off to the ready flash (busy entry cleared). */
  readyShown: boolean;
};

/**
 * In-flight busy label for the current gates, or `null` when startup should
 * clear busy status (ready flash is separate).
 */
export function startupBusyLabel(state: StartupGateState): string | null {
  if (state.readyShown) return null;
  if (!state.hydrated && !state.extensionsReady) return "Starting Silo…";
  if (!state.hydrated) return "Loading workspaces…";
  if (!state.extensionsReady) return "Loading extensions…";
  if (!state.layoutReady) return "Restoring workspace…";
  if (state.terminalsExpected > 0) {
    const waitingForFirst =
      state.terminalsBegun < state.terminalsExpected &&
      state.terminalsInFlight === 0;
    const stillWorking =
      state.terminalsInFlight > 0 ||
      state.terminalsBegun < state.terminalsExpected;
    if (waitingForFirst || stillWorking) {
      return state.terminalsExpected === 1
        ? "Restoring terminal…"
        : "Restoring terminals…";
    }
  }
  return null;
}

/** Whether terminal restore has finished for the startup cohort. */
export function startupTerminalsSettled(state: StartupGateState): boolean {
  if (!state.layoutReady) return false;
  if (state.terminalsExpected === 0) return true;
  return (
    state.terminalsBegun >= state.terminalsExpected &&
    state.terminalsInFlight === 0
  );
}
