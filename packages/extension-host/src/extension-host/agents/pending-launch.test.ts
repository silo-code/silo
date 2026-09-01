import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendInput } = vi.hoisted(() => ({
  sendInput: vi.fn(),
}));
vi.mock("../../services/tauri-terminal-client", () => ({
  tauriTerminalClient: { sendInput },
}));

import { store } from "../../state/store";
import { addAgentProfile } from "../../state/agent-profiles";
import {
  requestProfileLaunch,
  requestRawLaunch,
  takePendingLaunch,
  discardPendingLaunch,
  hasPendingLaunch,
  drainPendingLaunch,
} from "./pending-launch";

beforeEach(() => {
  store.agentProfiles = [];
  sendInput.mockReset();
});

describe("pending-launch registry (RFC 0033 R6)", () => {
  it("take after request returns the launch, then null (remove-on-read)", () => {
    requestProfileLaunch("t1", "claude-work");
    expect(takePendingLaunch("t1")).toEqual({ profileId: "claude-work" });
    expect(takePendingLaunch("t1")).toBeNull();
  });

  it("discard makes a later take return null", () => {
    requestProfileLaunch("t1", "p");
    discardPendingLaunch("t1");
    expect(takePendingLaunch("t1")).toBeNull();
  });

  it("keeps two terminals' pending launches independent", () => {
    requestProfileLaunch("t1", "a");
    requestRawLaunch("t2", "claude");
    expect(hasPendingLaunch("t1")).toBe(true);
    expect(takePendingLaunch("t2")).toEqual({ rawLine: "claude" });
    expect(takePendingLaunch("t1")).toEqual({ profileId: "a" });
  });
});

describe("drainPendingLaunch", () => {
  it("types the resolved launch line for a live profile, once", () => {
    addAgentProfile({
      id: "claude-work",
      label: "W",
      command: "claude-work",
      configDir: "/Users/d/.claude-work",
      assumedAgentId: "claude",
    });
    requestProfileLaunch("t1", "claude-work");
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).toHaveBeenCalledWith(
      "sess-1",
      "CLAUDE_CONFIG_DIR='/Users/d/.claude-work' claude-work\r",
    );
    // second drain is a no-op
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when the profile was deleted before the drain", () => {
    requestProfileLaunch("t1", "gone");
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).not.toHaveBeenCalled();
  });

  it("writes nothing when there is no pending launch", () => {
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).not.toHaveBeenCalled();
  });

  it("types a raw line verbatim", () => {
    requestRawLaunch("t1", "pi");
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).toHaveBeenCalledWith("sess-1", "pi\r");
  });
});
