import { describe, it, expect } from "vitest";
import {
  detectClaudeCode,
  detectCopilotCLI,
  detectCodexCLI,
  detectShellIntegration,
} from "./osc-detectors";

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------
describe("detectClaudeCode", () => {
  it("returns working+schedule for braille spinner frames", () => {
    // ⠋ U+280B, ⠙ U+2819, ⠏ U+280F — sample Codex/Claude spinner frames
    for (const ch of ["⠋", "⠙", "⠏", "⠀", "⣿"]) {
      expect(detectClaudeCode(0, `${ch} my-project`)).toEqual({
        status: "working",
        source: "agent",
        timer: "schedule",
      });
    }
  });

  it("returns waiting+clear for the ✳ idle char", () => {
    expect(detectClaudeCode(0, "✳ waiting…")).toEqual({
      status: "waiting",
      source: "agent",
      timer: "clear",
    });
  });

  it("returns null for a plain title string", () => {
    expect(detectClaudeCode(0, "my-project")).toBeNull();
  });

  it("returns null for non-OSC-0 codes", () => {
    expect(detectClaudeCode(9, "⠋ spinner")).toBeNull();
    expect(detectClaudeCode(133, "C")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GitHub Copilot CLI
// ---------------------------------------------------------------------------
describe("detectCopilotCLI", () => {
  it("returns working for states 1, 2, 3", () => {
    expect(detectCopilotCLI(9, "4;1")).toEqual({
      status: "working",
      source: "agent",
    });
    expect(detectCopilotCLI(9, "4;2;50")).toEqual({
      status: "working",
      source: "agent",
    });
    expect(detectCopilotCLI(9, "4;3;0")).toEqual({
      status: "working",
      source: "agent",
    });
  });

  it("returns waiting for states 0 and 4", () => {
    expect(detectCopilotCLI(9, "4;0;0")).toEqual({
      status: "waiting",
      source: "agent",
    });
    expect(detectCopilotCLI(9, "4;4")).toEqual({
      status: "waiting",
      source: "agent",
    });
  });

  it("returns null for unknown state values", () => {
    expect(detectCopilotCLI(9, "4;99")).toBeNull();
  });

  it("returns null for non-progress OSC 9 payloads", () => {
    expect(detectCopilotCLI(9, "Agent turn complete")).toBeNull();
    expect(detectCopilotCLI(9, "Approval requested: rm -rf")).toBeNull();
  });

  it("returns null for non-OSC-9 codes", () => {
    expect(detectCopilotCLI(0, "4;3;0")).toBeNull();
    expect(detectCopilotCLI(133, "4;3")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Codex CLI
// ---------------------------------------------------------------------------
describe("detectCodexCLI", () => {
  it("returns waiting+clear for empty OSC 0 (exited)", () => {
    expect(detectCodexCLI(0, "")).toEqual({
      status: "waiting",
      source: "agent",
      timer: "clear",
    });
  });

  it("returns waiting+clear for action-required OSC 0 prefixes", () => {
    expect(detectCodexCLI(0, "[ ! ] Action Required - my-project")).toEqual({
      status: "waiting",
      source: "agent",
      timer: "clear",
    });
    expect(detectCodexCLI(0, "[ . ] Action Required - my-project")).toEqual({
      status: "waiting",
      source: "agent",
      timer: "clear",
    });
  });

  it("returns null for a plain project-name OSC 0", () => {
    expect(detectCodexCLI(0, "my-project")).toBeNull();
  });

  it("returns null for braille OSC 0 (handled by detectClaudeCode)", () => {
    expect(detectCodexCLI(0, "⠋ my-project")).toBeNull();
  });

  it("returns waiting+clear for known OSC 9 notification payloads", () => {
    expect(detectCodexCLI(9, "Agent turn complete")).toEqual({
      status: "waiting",
      source: "agent",
      timer: "clear",
    });
    expect(detectCodexCLI(9, "Approval requested: rm -rf /")).toEqual({
      status: "waiting",
      source: "agent",
      timer: "clear",
    });
    expect(detectCodexCLI(9, "Codex wants to edit src/main.ts")).toEqual({
      status: "waiting",
      source: "agent",
      timer: "clear",
    });
  });

  it("returns null for unrecognised OSC 9 payloads", () => {
    expect(detectCodexCLI(9, "Some random notification")).toBeNull();
    // Must not catch Copilot progress payloads
    expect(detectCodexCLI(9, "4;3;0")).toBeNull();
  });

  it("returns null for non-OSC-0/9 codes", () => {
    expect(detectCodexCLI(133, "")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Shell integration (OSC 133)
// ---------------------------------------------------------------------------
describe("detectShellIntegration", () => {
  it("returns working+schedule with shell source for 133;C", () => {
    expect(detectShellIntegration(133, "C")).toEqual({
      status: "working",
      source: "shell",
      timer: "schedule",
    });
  });

  it("returns waiting+clear for 133;A (plain and with kitty params)", () => {
    expect(detectShellIntegration(133, "A")).toEqual({
      status: "waiting",
      source: "shell",
      timer: "clear",
    });
    expect(detectShellIntegration(133, "A;k=s")).toEqual({
      status: "waiting",
      source: "shell",
      timer: "clear",
    });
  });

  it("returns waiting+clear for 133;D (plain and with exit code)", () => {
    for (const payload of ["D", "D;0", "D;1"]) {
      expect(detectShellIntegration(133, payload)).toEqual({
        status: "waiting",
        source: "shell",
        timer: "clear",
      });
    }
  });

  it("returns null for 133;B (command entered — not a status transition)", () => {
    expect(detectShellIntegration(133, "B")).toBeNull();
  });

  it("returns null for non-OSC-133 codes", () => {
    expect(detectShellIntegration(0, "C")).toBeNull();
    expect(detectShellIntegration(9, "C")).toBeNull();
  });
});
