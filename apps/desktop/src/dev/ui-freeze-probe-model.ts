/** Default gap that counts as a UI hitch (rAF stall). */
export const DEFAULT_FREEZE_THRESHOLD_MS = 100;

/** Ignore early frames — boot hydrate/extension load is expected jank. */
export const DEFAULT_WARMUP_MS = 2000;

export interface FreezeProbeTickInput {
  prevFrameMs: number | null;
  nowMs: number;
  startedAtMs: number;
  hidden: boolean;
  thresholdMs: number;
  warmupMs: number;
}

export type FreezeProbeTickResult =
  | { kind: "skip"; nextPrev: number | null }
  | { kind: "ok"; gapMs: number; nextPrev: number }
  | { kind: "freeze"; gapMs: number; nextPrev: number };

/**
 * Pure rAF tick: compare wall-clock gap since the previous painted frame.
 * Skips while the document is hidden (rAF pauses) and during warmup.
 */
export function tickFreezeProbe(
  input: FreezeProbeTickInput,
): FreezeProbeTickResult {
  const { prevFrameMs, nowMs, startedAtMs, hidden, thresholdMs, warmupMs } =
    input;

  if (hidden) {
    return { kind: "skip", nextPrev: null };
  }

  if (prevFrameMs === null) {
    return { kind: "ok", gapMs: 0, nextPrev: nowMs };
  }

  const gapMs = nowMs - prevFrameMs;
  const warmingUp = nowMs - startedAtMs < warmupMs;
  if (warmingUp) {
    return { kind: "ok", gapMs, nextPrev: nowMs };
  }

  if (gapMs >= thresholdMs) {
    return { kind: "freeze", gapMs, nextPrev: nowMs };
  }

  return { kind: "ok", gapMs, nextPrev: nowMs };
}

/** Human-readable Output / overlay line for a detected stall. */
export function formatFreezeLog(gapMs: number, at: Date): string {
  const ms = Math.round(gapMs);
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  const ss = String(at.getSeconds()).padStart(2, "0");
  const mss = String(at.getMilliseconds()).padStart(3, "0");
  return `UI freeze ${ms}ms at ${hh}:${mm}:${ss}.${mss} (rAF stalled)`;
}

/** Gaps this large are usually background throttle / sleep, not in-app work. */
export const BACKGROUND_GAP_MS = 5000;

/** How far before stall *onset* to scan other Output channels. */
export const CORRELATE_LOOKBACK_MS = 2000;

export interface CorrelateEntry {
  timestampMs: number;
  channel: string;
  message: string;
}

/**
 * Pick Output lines that overlap a stall: from
 * `(freezeEnd - gapMs - lookback)` through `freezeEnd`.
 * Skips the freeze channel's own lines.
 */
export function correlateAroundFreeze(
  entries: CorrelateEntry[],
  freezeEndMs: number,
  gapMs: number,
  lookbackMs: number = CORRELATE_LOOKBACK_MS,
  freezeChannelKey: string = "silo:ui-freeze",
): CorrelateEntry[] {
  const start = freezeEndMs - gapMs - lookbackMs;
  return entries.filter(
    (e) =>
      e.channel !== freezeChannelKey &&
      e.timestampMs >= start &&
      e.timestampMs <= freezeEndMs,
  );
}

/** Compact summary for the freeze log body (top channels by count). */
export function summarizeCorrelation(
  entries: CorrelateEntry[],
  max = 8,
): string {
  if (entries.length === 0) return "no nearby Output activity";
  const counts = new Map<string, number>();
  for (const e of entries) {
    counts.set(e.channel, (counts.get(e.channel) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const parts = ranked.slice(0, max).map(([ch, n]) => `${ch}×${n}`);
  const extra = ranked.length > max ? ` +${ranked.length - max} more` : "";
  return `${entries.length} nearby: ${parts.join(", ")}${extra}`;
}

/** Dev: on unless `"0"`. Release: on only when `"1"`. */
export function probeEnabledFromStorage(
  raw: string | null,
  isDev: boolean,
): boolean {
  if (isDev) return raw !== "0";
  return raw === "1";
}
