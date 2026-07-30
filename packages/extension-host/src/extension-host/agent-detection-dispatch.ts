/**
 * Pure decision logic for what to *do* with one {@link DetectionResult}:
 * which debounce timers to arm/clear, and whether (and with what) to dispatch
 * a `"detected"` event to the activity reducer. Ported from
 * `silo-extensions/agent-monitor`'s `terminal-tracker.ts` `applyDetection` —
 * that logic only ever lived inline there; extracted here (mirroring
 * `matchHookEventsToTerminals`'s precedent) so the branching itself is
 * unit-testable without driving the real timers/`sessions` Map in
 * `agents-service.ts`.
 *
 * Two debounce timers exist, for two different problems:
 *
 * - **Shell-idle** ({@link SHELL_IDLE_MS}): some shell-integration-only
 *   agents (e.g. `pi`) emit OSC 133;C per step but never emit 133;A/D on
 *   completion — without a fallback they'd read "working" forever. Silence
 *   for this long clears to "idle".
 * - **Agent-idle** ({@link AGENT_IDLE_DEBOUNCE_MS}): Claude Code emits its
 *   `✳` idle marker briefly *between* tool calls while computing the next
 *   action — treating that as an immediate "idle" would flicker. Debounce
 *   it: only actually transition if no working (braille) signal arrives
 *   within this window. The same timer, kept continuously re-armed instead of
 *   cleared, is also Cursor Agent's raw-output spinner fallback's *only*
 *   "idle" signal — there is no explicit idle marker in raw output, just
 *   silence after the last spinner frame.
 */
import type { DetectionResult } from "./agent-osc-detectors";

export const SHELL_IDLE_MS = 3_000;
export const AGENT_IDLE_DEBOUNCE_MS = 1_500;

export type TimerAction = "schedule" | "clear" | null;

export interface DetectionPlan {
  /** What to do with the shell-idle timer. */
  shellTimerAction: TimerAction;
  /** What to do with the agent-idle timer. */
  agentTimerAction: TimerAction;
  /** Event to dispatch to the activity reducer, or `null` to only touch
   * timers this tick (the debounce-armed "idle" case below — the actual
   * transition happens later, when/if the timer fires). */
  dispatch: {
    status: DetectionResult["status"];
    source: DetectionResult["source"];
  } | null;
}

/**
 * Decide the plan for one detection result. Callers apply `shellTimerAction`/
 * `agentTimerAction` to their own per-terminal timer state, then dispatch
 * `dispatch` (if non-null) as a `"detected"` event.
 */
export function planDetection(result: DetectionResult): DetectionPlan {
  const shellTimerAction: TimerAction =
    result.timer === "schedule"
      ? "schedule"
      : result.timer === "clear"
        ? "clear"
        : null;

  if (result.status === "idle" && result.source === "agent") {
    // Debounce: don't dispatch "idle" yet — arm the agent-idle timer and
    // only transition if nothing reconfirms "working" before it fires.
    return { shellTimerAction, agentTimerAction: "schedule", dispatch: null };
  }

  if (result.timer === "schedule-agent") {
    // Cursor's raw-output fallback: keep the agent-idle timer continuously
    // re-armed (its only "idle" signal is silence), but still dispatch this
    // "working" tick now.
    return {
      shellTimerAction,
      agentTimerAction: "schedule",
      dispatch: { status: result.status, source: result.source },
    };
  }

  return {
    shellTimerAction,
    agentTimerAction: result.status === "working" ? "clear" : null,
    dispatch: { status: result.status, source: result.source },
  };
}
