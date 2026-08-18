/**
 * Pure selection rules for StatusBar busy status (RFC 0026).
 *
 * Keep this free of React/valtio so unit tests can pin primary-line + badge
 * behavior without rendering the bar.
 */

export type BusyStatusUrgency = "normal" | "high";

export interface BusyStatusEntryInput {
  id: string;
  label: string;
  detail?: string;
  urgency?: BusyStatusUrgency;
}

/** Stored form — input plus host bookkeeping. */
export interface BusyStatusEntry extends BusyStatusEntryInput {
  urgency: BusyStatusUrgency;
  /** Milliseconds since epoch; ties within an urgency tier break to newer. */
  updatedAt: number;
}

export interface BusyStatusSummary {
  /** Entry that should appear on the StatusBar summary line, or null if none. */
  primary: BusyStatusEntry | null;
  /** Total active entries — badge shows this when {@link BusyStatusSummary.count} > 1. */
  count: number;
}

/**
 * Pick the StatusBar summary entry: any `high` beats all `normal`; within a
 * tier, most recently updated wins.
 */
export function selectPrimaryBusyStatus(
  entries: readonly BusyStatusEntry[],
): BusyStatusEntry | null {
  if (entries.length === 0) return null;
  let best = entries[0]!;
  for (let i = 1; i < entries.length; i++) {
    const e = entries[i]!;
    if (cmpBusyStatus(e, best) > 0) best = e;
  }
  return best;
}

/** Positive if `a` should outrank `b` on the summary line. */
export function cmpBusyStatus(a: BusyStatusEntry, b: BusyStatusEntry): number {
  const ua = a.urgency === "high" ? 1 : 0;
  const ub = b.urgency === "high" ? 1 : 0;
  if (ua !== ub) return ua - ub;
  return a.updatedAt - b.updatedAt;
}

export function summarizeBusyStatus(
  entries: readonly BusyStatusEntry[],
): BusyStatusSummary {
  return {
    primary: selectPrimaryBusyStatus(entries),
    count: entries.length,
  };
}

/** Stable popover order: high first, then newer, then id. */
export function sortBusyStatusForPopover(
  entries: readonly BusyStatusEntry[],
): BusyStatusEntry[] {
  return [...entries].sort((a, b) => {
    const c = cmpBusyStatus(b, a); // descending
    if (c !== 0) return c;
    return a.id.localeCompare(b.id);
  });
}
