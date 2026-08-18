import {
  STARTUP_BUSY_ID,
  STARTUP_READY_DWELL_MS,
  STARTUP_TERMINALS_BUDGET_MS,
  startupBusyLabel,
  startupTerminalsSettled,
  type StartupGateState,
} from "./startup-status-model";
import { clearBusyStatus, setBusyStatus } from "./busy-status";
import {
  clearStatusFlash,
  flashStatus,
  resetStatusFlashForTests,
} from "./status-flash";

/**
 * Host-owned startup StatusBar sequence (RFC 0026): Loading workspaces →
 * extensions → workspace → terminals (busy status), then a brief host
 * {@link flashStatus} "Silo is ready".
 *
 * Driven from the app boot chain + WorkspaceDock + terminal restore cohort.
 */

let state: StartupGateState = initialState();
let started = false;
let finished = false;
let terminalsBudgetTimer: ReturnType<typeof setTimeout> | null = null;

function initialState(): StartupGateState {
  return {
    hydrated: false,
    extensionsReady: false,
    layoutReady: false,
    terminalsExpected: 0,
    terminalsBegun: 0,
    terminalsInFlight: 0,
    readyShown: false,
  };
}

/** True while the startup sequence still owns the in-flight StatusBar line. */
export function isStartupStatusActive(): boolean {
  return started && !finished;
}

/** Call once at app boot (before hydrate / extension load race). */
export function beginStartupStatus(): void {
  if (started) return;
  started = true;
  finished = false;
  state = initialState();
  publish();
}

export function markStartupHydrated(): void {
  if (!started || finished) return;
  state = { ...state, hydrated: true };
  publish();
  maybeFinishTerminalsOrReady();
}

export function markStartupExtensionsReady(): void {
  if (!started || finished) return;
  state = { ...state, extensionsReady: true };
  publish();
  maybeFinishTerminalsOrReady();
}

/**
 * Active workspace dock finished restoring layout. `terminalsExpected` is the
 * count of tabs that will `process.attach` (have a persisted sessionId).
 */
export function markStartupLayoutReady(terminalsExpected: number): void {
  if (!started || finished) return;
  if (state.layoutReady) return;
  state = {
    ...state,
    layoutReady: true,
    terminalsExpected: Math.max(0, terminalsExpected),
    terminalsBegun: 0,
    terminalsInFlight: 0,
  };
  if (terminalsBudgetTimer) {
    clearTimeout(terminalsBudgetTimer);
    terminalsBudgetTimer = null;
  }
  if (state.terminalsExpected > 0) {
    terminalsBudgetTimer = setTimeout(() => {
      terminalsBudgetTimer = null;
      if (!isStartupStatusActive() || state.readyShown) return;
      // Don't hang forever if a panel never mounts.
      enterReady();
    }, STARTUP_TERMINALS_BUDGET_MS);
  }
  publish();
  maybeFinishTerminalsOrReady();
}

/** Terminal restore attach started — only counted while startup is active. */
export function startupTerminalRestoreBegin(): void {
  if (!isStartupStatusActive() || !state.layoutReady || state.readyShown)
    return;
  state = {
    ...state,
    terminalsBegun: state.terminalsBegun + 1,
    terminalsInFlight: state.terminalsInFlight + 1,
  };
  publish();
}

/** Terminal restore attach settled. */
export function startupTerminalRestoreEnd(): void {
  if (!isStartupStatusActive() || !state.layoutReady || state.readyShown)
    return;
  state = {
    ...state,
    terminalsInFlight: Math.max(0, state.terminalsInFlight - 1),
  };
  publish();
  maybeFinishTerminalsOrReady();
}

function maybeFinishTerminalsOrReady(): void {
  if (!state.hydrated || !state.extensionsReady || !state.layoutReady) return;
  if (!startupTerminalsSettled(state)) return;
  enterReady();
}

function enterReady(): void {
  if (finished || state.readyShown) return;
  if (terminalsBudgetTimer) {
    clearTimeout(terminalsBudgetTimer);
    terminalsBudgetTimer = null;
  }
  state = { ...state, readyShown: true };
  finished = true;
  clearBusyStatus(STARTUP_BUSY_ID);
  flashStatus({
    label: "Silo is ready",
    dwellMs: STARTUP_READY_DWELL_MS,
  });
}

function publish(): void {
  if (!started || finished) return;
  const label = startupBusyLabel(state);
  if (!label) {
    // Settled but enterReady not yet called from this path — clear busy only.
    clearBusyStatus(STARTUP_BUSY_ID);
    return;
  }
  setBusyStatus({
    id: STARTUP_BUSY_ID,
    label,
    urgency: "high",
  });
}

/** Test helper. */
export function resetStartupStatusForTests(): void {
  if (terminalsBudgetTimer) {
    clearTimeout(terminalsBudgetTimer);
    terminalsBudgetTimer = null;
  }
  started = false;
  finished = false;
  state = initialState();
  clearBusyStatus(STARTUP_BUSY_ID);
  resetStatusFlashForTests();
  clearStatusFlash();
}
