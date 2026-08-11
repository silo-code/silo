import type { Status, TerminalEntry, TerminalLog } from "./demo-config";

export const TERMINAL_DEFAULT_DELAY_MS = 250;

export type TerminalReveal = {
  entries: TerminalEntry[];
  status: Status;
};

/**
 * How many log entries are visible at an absolute clock time.
 * Each entry's `delayMs` is the wait *before* it appears (after the previous
 * reveal). At `atMs <= 0` nothing has appeared yet — used by the vignette
 * recorder so terminals stay idle until Play advances the playhead.
 */
export function revealedTerminalAt(
  log: TerminalLog,
  atMs: number,
): TerminalReveal {
  if (atMs <= 0 || log.entries.length === 0) {
    return { entries: [], status: "waiting" };
  }

  let t = 0;
  const entries: TerminalEntry[] = [];
  for (const entry of log.entries) {
    t += entry.delayMs ?? TERMINAL_DEFAULT_DELAY_MS;
    if (atMs < t) break;
    entries.push(entry);
  }

  if (entries.length === 0) return { entries: [], status: "waiting" };
  if (entries.length >= log.entries.length) {
    return { entries, status: "ready" };
  }
  return { entries, status: "working" };
}

/** Wall-clock length of one pass through a terminal log (sum of entry delays). */
export function terminalDurationMs(log: TerminalLog): number {
  let total = 0;
  for (const entry of log.entries) {
    total += entry.delayMs ?? TERMINAL_DEFAULT_DELAY_MS;
  }
  return total;
}
