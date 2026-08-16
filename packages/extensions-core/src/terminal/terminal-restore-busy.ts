import type { ExtensionContext } from "@silo-code/sdk";

/** Host busy-status id for the restore cohort (RFC 0026). */
export const TERMINAL_RESTORE_BUSY_ID = "core.terminal.restore";

/** Wall-clock budget before the label softens to "Still restoring…" (RFC 0026). */
const COHORT_SOFT_MS = 10_000;

let busy: ExtensionContext["ui"]["busyStatus"] | null = null;
let notify:
  | ((level: "info" | "warn" | "error", message: string) => void)
  | null = null;

let inFlight = 0;
let failed = 0;
let stillRestoring = false;
let softTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Bind the terminal extension's `ctx` so restore attaches can drive busy status
 * + failure toasts. Call once from `activate`.
 */
export function bindTerminalRestoreBusy(ctx: ExtensionContext): void {
  busy = ctx.ui.busyStatus;
  notify = (level, message) => {
    ctx.ui.notify(level, message);
  };
}

/** One restore attach started (`process.attach`, not a fresh spawn). */
export function beginTerminalRestoreAttach(): void {
  inFlight += 1;
  if (inFlight === 1) {
    failed = 0;
    stillRestoring = false;
    if (softTimer) clearTimeout(softTimer);
    softTimer = setTimeout(() => {
      softTimer = null;
      if (inFlight === 0) return;
      stillRestoring = true;
      publish();
    }, COHORT_SOFT_MS);
  }
  publish();
}

/**
 * One restore attach settled. `ok` false counts toward the cohort failure
 * notify (session gone / recreate is still `ok` — the tab recovers itself).
 */
export function endTerminalRestoreAttach(ok: boolean): void {
  if (!ok) failed += 1;
  inFlight = Math.max(0, inFlight - 1);
  if (inFlight === 0) {
    if (softTimer) {
      clearTimeout(softTimer);
      softTimer = null;
    }
    stillRestoring = false;
    busy?.clear(TERMINAL_RESTORE_BUSY_ID);
    if (failed > 0 && notify) {
      const n = failed;
      failed = 0;
      notify(
        "error",
        n === 1
          ? "1 terminal needs reconnect"
          : `${n} terminals need reconnect`,
      );
    } else {
      failed = 0;
    }
    return;
  }
  publish();
}

function publish(): void {
  if (!busy || inFlight === 0) return;
  const label = stillRestoring
    ? "Still restoring terminals…"
    : inFlight === 1
      ? "Restoring terminal…"
      : "Restoring terminals…";
  busy.set({
    id: TERMINAL_RESTORE_BUSY_ID,
    label,
    detail: `${inFlight} in progress`,
    urgency: "normal",
  });
}

/** Test helper — reset module state between unit tests. */
export function resetTerminalRestoreBusyForTests(): void {
  if (softTimer) {
    clearTimeout(softTimer);
    softTimer = null;
  }
  inFlight = 0;
  failed = 0;
  stillRestoring = false;
  busy = null;
  notify = null;
}
