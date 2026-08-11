export {
  SCRIPT_CLICK_RELEASE_MS,
  SCRIPT_DEFAULT_HOLD_MS,
  scriptDurationMs,
  planScriptSeek,
  type ScriptSeekPlan,
} from "@silo-code/website/demo";

export type TimelineRange = {
  /** Inclusive start of the record window, ms from script start. */
  startMs: number;
  /** Exclusive end of the record window, ms from script start. */
  endMs: number;
};

export function clampTimelineRange(
  range: TimelineRange,
  durationMs: number,
): TimelineRange {
  const duration = Math.max(1, durationMs);
  let startMs = Math.max(0, Math.min(range.startMs, duration));
  let endMs = Math.max(0, Math.min(range.endMs, duration));
  if (endMs - startMs < 200) {
    endMs = Math.min(duration, startMs + 200);
    if (endMs - startMs < 200) {
      startMs = Math.max(0, endMs - 200);
    }
  }
  return { startMs, endMs };
}

export function formatTimelineTime(ms: number): string {
  const totalSec = Math.max(0, ms) / 1000;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec - minutes * 60;
  if (minutes > 0) {
    return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
  }
  return `${seconds.toFixed(1)}s`;
}
