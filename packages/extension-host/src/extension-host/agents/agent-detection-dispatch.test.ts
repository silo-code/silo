import { describe, expect, it } from "vitest";
import { planDetection } from "./agent-detection-dispatch";
import type { DetectionResult } from "./agent-osc-detectors";

describe("planDetection", () => {
  it("shell working: schedules the shell-idle timer, clears any pending agent-idle debounce, dispatches now", () => {
    // Matches agent-monitor's upstream `applyDetection` exactly: the final
    // `else` branch clears the agent-idle timer for ANY "working" status,
    // shell-sourced included — a plain command starting cancels a pending
    // Claude-idle debounce the same as an agent one would.
    const result: DetectionResult = {
      status: "working",
      source: "shell",
      timer: "schedule",
    };
    expect(planDetection(result)).toEqual({
      shellTimerAction: "schedule",
      agentTimerAction: "clear",
      dispatch: { status: "working", source: "shell" },
    });
  });

  it("shell idle: clears the shell-idle timer and dispatches immediately", () => {
    const result: DetectionResult = {
      status: "idle",
      source: "shell",
      timer: "clear",
    };
    expect(planDetection(result)).toEqual({
      shellTimerAction: "clear",
      agentTimerAction: null,
      dispatch: { status: "idle", source: "shell" },
    });
  });

  it("agent working (Claude braille): arms shell timer as a no-op fallback, clears the agent timer, dispatches now", () => {
    const result: DetectionResult = {
      status: "working",
      source: "agent",
      timer: "schedule",
    };
    expect(planDetection(result)).toEqual({
      shellTimerAction: "schedule",
      agentTimerAction: "clear",
      dispatch: { status: "working", source: "agent" },
    });
  });

  it("agent idle (Claude ✳ / Codex idle): debounces — arms the agent timer, does NOT dispatch yet", () => {
    const result: DetectionResult = {
      status: "idle",
      source: "agent",
      timer: "clear",
    };
    const plan = planDetection(result);
    expect(plan.agentTimerAction).toBe("schedule");
    expect(plan.dispatch).toBeNull();
  });

  it("agent idle with no timer field (Copilot) still debounces the same way", () => {
    const result: DetectionResult = { status: "idle", source: "agent" };
    const plan = planDetection(result);
    expect(plan.agentTimerAction).toBe("schedule");
    expect(plan.dispatch).toBeNull();
  });

  it("identity-only agent idle (pi title) dispatches immediately", () => {
    const result: DetectionResult = {
      status: "idle",
      source: "agent",
      identity: true,
    };
    expect(planDetection(result)).toEqual({
      shellTimerAction: null,
      agentTimerAction: null,
      dispatch: { status: "idle", source: "agent" },
    });
  });

  it("agent working with no timer field (Copilot) dispatches now and clears the agent timer", () => {
    const result: DetectionResult = { status: "working", source: "agent" };
    expect(planDetection(result)).toEqual({
      shellTimerAction: null,
      agentTimerAction: "clear",
      dispatch: { status: "working", source: "agent" },
    });
  });

  it("schedule-agent (Cursor raw-output spinner fallback): keeps re-arming the agent timer AND dispatches now", () => {
    const result: DetectionResult = {
      status: "working",
      source: "agent",
      timer: "schedule-agent",
    };
    expect(planDetection(result)).toEqual({
      shellTimerAction: null,
      agentTimerAction: "schedule",
      dispatch: { status: "working", source: "agent" },
    });
  });

  it("error status bypasses the idle-debounce even when agent-sourced", () => {
    const error: DetectionResult = { status: "error", source: "agent" };
    expect(planDetection(error).dispatch).toEqual({
      status: "error",
      source: "agent",
    });
  });
});
