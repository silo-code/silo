import { describe, expect, it } from "vitest";
import type { TerminalLog } from "./demo-config";
import { revealedTerminalAt, terminalDurationMs } from "./terminal-playback";

const log: TerminalLog = {
  kind: "agent",
  agent: {
    agentId: "claude",
    agentName: "Claude Code",
    cwd: "~/projects/demo",
  },
  loop: false,
  entries: [
    { type: "command", text: "› go", delayMs: 500 },
    { type: "agent-text", text: "thinking", delayMs: 1000 },
    { type: "success", text: "done", delayMs: 400 },
  ],
};

describe("revealedTerminalAt", () => {
  it("shows nothing at or before t=0", () => {
    expect(revealedTerminalAt(log, 0)).toEqual({
      entries: [],
      status: "waiting",
    });
    expect(revealedTerminalAt(log, -10).entries).toEqual([]);
  });

  it("waits through the first entry delay before revealing it", () => {
    expect(revealedTerminalAt(log, 499).entries).toEqual([]);
    expect(revealedTerminalAt(log, 500).entries).toHaveLength(1);
    expect(revealedTerminalAt(log, 500).status).toBe("working");
  });

  it("reveals the full transcript once past the last delay", () => {
    expect(revealedTerminalAt(log, 1900)).toEqual({
      entries: log.entries,
      status: "ready",
    });
  });
});

describe("terminalDurationMs", () => {
  it("sums entry delays", () => {
    expect(terminalDurationMs(log)).toBe(1900);
  });
});
