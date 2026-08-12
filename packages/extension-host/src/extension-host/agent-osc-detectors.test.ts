import { describe, it, expect } from "vitest";
import {
  detectClaudeCode,
  detectCursorAgent,
  detectCursorAgentOutput,
  detectCopilotCLI,
  detectCodexCLI,
  detectCodexIdleAfterWorking,
  detectShellIntegration,
  stripAgentStatusMarkers,
  CURSOR_SPINNER_FRAMES,
} from "./agent-osc-detectors";

// Test cases adapted from silo-extensions/agent-monitor's own
// osc-detectors.test.ts — these detectors were ported verbatim from there,
// so its proven cases are the right ones to carry over. NOT ported:
// `detectFromOscTitle` (restore-time re-seeding from a terminal's current
// title) — that solves a problem specific to a *separately reloadable*
// extension losing live OSC frames across its own reload/re-enable while the
// app keeps running; ctx.agents lives in the host itself, which doesn't have
// an analogous "reloaded independently of the app" lifecycle (a full app
// restart is already covered by `restoreState`'s `stale`-gap handling).

// ---------------------------------------------------------------------------
// Cursor Agent
// ---------------------------------------------------------------------------
describe("detectCursorAgent", () => {
  it("returns working+schedule for generating / planning / shell titles", () => {
    expect(detectCursorAgent(0, "Cursor Agent - ⏳ Working ...")).toEqual({
      status: "working",
      source: "agent",
      timer: "schedule",
    });
    expect(detectCursorAgent(0, "my-chat - 🧭 Planning")).toEqual({
      status: "working",
      source: "agent",
      timer: "schedule",
    });
    expect(
      detectCursorAgent(0, "Cursor Agent - ⌨️ Running shell command (wt)"),
    ).toEqual({
      status: "working",
      source: "agent",
      timer: "schedule",
    });
  });

  it("returns working for emoji-less status text (useEmoji=false)", () => {
    expect(detectCursorAgent(0, "Cursor Agent - Working ···")).toEqual({
      status: "working",
      source: "agent",
      timer: "schedule",
    });
  });

  it("returns idle+clear for Ready / Waiting for you / confirmation", () => {
    expect(detectCursorAgent(0, "Cursor Agent - ✅ Ready")).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
    expect(detectCursorAgent(0, "my-chat - ❓ Waiting for you")).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
    expect(
      detectCursorAgent(0, "my-chat - 🔐 Waiting for confirmation (feature)"),
    ).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
  });

  it("returns idle+clear for bare Cursor Agent idle titles", () => {
    expect(detectCursorAgent(0, "Cursor Agent")).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
    expect(detectCursorAgent(0, "Cursor Agent (local-agent)")).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
    expect(detectCursorAgent(0, "Cursor Agent (my-worktree)")).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
  });

  it("returns null for unrelated OSC 0 titles", () => {
    expect(detectCursorAgent(0, "my-project")).toBeNull();
    expect(detectCursorAgent(0, "⠋ my-project")).toBeNull();
    expect(detectCursorAgent(0, "✳ waiting…")).toBeNull();
    expect(detectCursorAgent(0, "")).toBeNull();
  });

  it("returns null for non-OSC-0 codes", () => {
    expect(detectCursorAgent(9, "Cursor Agent - ✅ Ready")).toBeNull();
    expect(detectCursorAgent(133, "C")).toBeNull();
  });
});

describe("detectCursorAgentOutput", () => {
  it("returns working+schedule-agent for each known spinner frame", () => {
    for (const frame of CURSOR_SPINNER_FRAMES) {
      expect(detectCursorAgentOutput(`prefix ${frame} suffix`)).toEqual({
        status: "working",
        source: "agent",
        timer: "schedule-agent",
      });
    }
  });

  it("returns null for single-cell braille (Claude/Codex OSC style)", () => {
    expect(detectCursorAgentOutput("⠋ working")).toBeNull();
    expect(detectCursorAgentOutput("⠀")).toBeNull();
  });

  it("returns null for plain output", () => {
    expect(detectCursorAgentOutput("Cursor Agent")).toBeNull();
    expect(detectCursorAgentOutput("hello world")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------
describe("detectClaudeCode", () => {
  it("returns working+schedule for braille spinner frames", () => {
    // ⠋ U+280B, ⠙ U+2819, ⠏ U+280F — Codex/Grok frames, and Claude's own
    // before claude-code 2.1.228 switched to the circles below. Range ends
    // (U+2800, U+28FF) included so a regression to a narrower test is caught.
    for (const ch of ["⠋", "⠙", "⠏", "⠀", "⣿"]) {
      expect(detectClaudeCode(0, `${ch} my-project`)).toEqual({
        status: "working",
        source: "agent",
        timer: "schedule",
      });
    }
  });

  it("returns working+schedule for Claude's circle spinner frames", () => {
    // Regression: claude-code 2.1.228 replaced the braille title spinner with
    // ◐/◑ (its own frames), which the braille-only range check missed — the
    // terminal stayed "never working" while idle detection kept working. The
    // full U+25D0–25D3 block is accepted, so ◒/◓ are covered too.
    for (const ch of ["◐", "◑", "◒", "◓"]) {
      expect(detectClaudeCode(0, `${ch} Design event bus`)).toEqual({
        status: "working",
        source: "agent",
        timer: "schedule",
      });
    }
  });

  it("returns null for circle glyphs just outside the spinner block", () => {
    // U+25CF ● and U+25D4 ◔ both appear in Claude's glyph table but are not
    // title spinner frames — the range must not creep.
    expect(detectClaudeCode(0, "● my-project")).toBeNull();
    expect(detectClaudeCode(0, "◔ my-project")).toBeNull();
  });

  it("returns idle+clear for the ✳ idle char", () => {
    expect(detectClaudeCode(0, "✳ waiting…")).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
  });

  it("returns null for a plain title string", () => {
    expect(detectClaudeCode(0, "my-project")).toBeNull();
  });

  it("returns null for an empty title (Codex's exit signal, not Claude's)", () => {
    expect(detectClaudeCode(0, "")).toBeNull();
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

  it("returns idle for states 0 and 4", () => {
    expect(detectCopilotCLI(9, "4;0;0")).toEqual({
      status: "idle",
      source: "agent",
    });
    expect(detectCopilotCLI(9, "4;4")).toEqual({
      status: "idle",
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
  it("returns idle+clear for empty OSC 0 (exited)", () => {
    expect(detectCodexCLI(0, "")).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
  });

  it("returns idle+clear for action-required OSC 0 prefixes", () => {
    expect(detectCodexCLI(0, "[ ! ] Action Required - my-project")).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
    expect(detectCodexCLI(0, "[ . ] Action Required - my-project")).toEqual({
      status: "idle",
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

  it("returns idle+clear for known OSC 9 notification payloads", () => {
    expect(detectCodexCLI(9, "Agent turn complete")).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
    expect(detectCodexCLI(9, "Approval requested: rm -rf /")).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
    expect(detectCodexCLI(9, "Codex wants to edit src/main.ts")).toEqual({
      status: "idle",
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

describe("detectCodexIdleAfterWorking", () => {
  it("returns idle when a plain title arrives during agent-sourced working", () => {
    expect(detectCodexIdleAfterWorking(0, "my-project", true)).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
    expect(detectCodexIdleAfterWorking(0, "codex-osc-test", true)).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
  });

  it("returns null when not currently agent-working", () => {
    expect(detectCodexIdleAfterWorking(0, "my-project", false)).toBeNull();
  });

  it("returns null for any spinner frame / Claude idle / empty / action-required (other detectors)", () => {
    expect(detectCodexIdleAfterWorking(0, "⠋ my-project", true)).toBeNull();
    // Circle frames must be excluded for the same reason braille is: this
    // fallback reads "title with no spinner glyph" as the agent having
    // finished, so treating a live ◐/◑ frame as idle would flip Claude back to
    // idle on every 960ms tick of its own spinner.
    for (const ch of ["◐", "◑", "◒", "◓"]) {
      expect(
        detectCodexIdleAfterWorking(0, `${ch} my-project`, true),
      ).toBeNull();
    }
    expect(detectCodexIdleAfterWorking(0, "✳ waiting…", true)).toBeNull();
    expect(detectCodexIdleAfterWorking(0, "", true)).toBeNull();
    expect(
      detectCodexIdleAfterWorking(0, "[ ! ] Action Required - x", true),
    ).toBeNull();
  });

  it("returns null for non-OSC-0 codes", () => {
    expect(detectCodexIdleAfterWorking(9, "my-project", true)).toBeNull();
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

  it("returns idle+clear for 133;A (plain and with kitty params)", () => {
    expect(detectShellIntegration(133, "A")).toEqual({
      status: "idle",
      source: "shell",
      timer: "clear",
    });
    expect(detectShellIntegration(133, "A;k=s")).toEqual({
      status: "idle",
      source: "shell",
      timer: "clear",
    });
  });

  it("returns idle+clear for 133;D (plain and with exit code)", () => {
    for (const payload of ["D", "D;0", "D;1"]) {
      expect(detectShellIntegration(133, payload)).toEqual({
        status: "idle",
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

// ---------------------------------------------------------------------------
// Stripping markers back out for display
// ---------------------------------------------------------------------------
describe("stripAgentStatusMarkers", () => {
  it("strips Claude's circle spinner frames and the ✳ idle marker", () => {
    for (const ch of ["◐", "◑", "◒", "◓", "✳"]) {
      expect(stripAgentStatusMarkers(`${ch} Design event bus`)).toBe(
        "Design event bus",
      );
    }
  });

  it("strips braille spinner frames (Codex / Grok / older Claude)", () => {
    for (const ch of ["⠋", "⠙", "⠀", "⣿"]) {
      expect(stripAgentStatusMarkers(`${ch} my-project`)).toBe("my-project");
    }
  });

  it("strips Codex's action-required markers", () => {
    expect(stripAgentStatusMarkers("[ ! ] Action Required - x")).toBe(
      "Action Required - x",
    );
    expect(stripAgentStatusMarkers("[ . ] my-project")).toBe("my-project");
  });

  it("strips Cursor's trailing status suffix, with and without emoji", () => {
    // The emoji cases are the ones a naive emoji character class gets wrong:
    // 📤 is a surrogate pair and ⌨️ carries a variation selector.
    expect(stripAgentStatusMarkers("my-chat - ⏳ Working ...")).toBe("my-chat");
    expect(stripAgentStatusMarkers("my-chat - 📤 Moving to cloud")).toBe(
      "my-chat",
    );
    expect(
      stripAgentStatusMarkers("Cursor Agent - ⌨️ Running shell command"),
    ).toBe("Cursor Agent");
    expect(stripAgentStatusMarkers("my-chat - Working ···")).toBe("my-chat");
    expect(stripAgentStatusMarkers("my-chat - ✅ Ready (feature)")).toBe(
      "my-chat",
    );
  });

  it('returns "" for a marker-only title so callers can fall back', () => {
    // Claude emits a bare ✳ before any conversation title exists; the caller
    // must show the program name, not an empty tab.
    expect(stripAgentStatusMarkers("✳")).toBe("");
    expect(stripAgentStatusMarkers("◐ ")).toBe("");
  });

  it("leaves an ordinary title untouched", () => {
    expect(stripAgentStatusMarkers("my-project")).toBe("my-project");
    expect(stripAgentStatusMarkers("~/src/silo — zsh")).toBe(
      "~/src/silo — zsh",
    );
    expect(stripAgentStatusMarkers("")).toBe("");
  });

  it("does not strip a bare Cursor idle title (no status segment)", () => {
    expect(stripAgentStatusMarkers("Cursor Agent")).toBe("Cursor Agent");
  });

  it("does not eat a hyphenated title that isn't a Cursor status", () => {
    expect(stripAgentStatusMarkers("silo - main")).toBe("silo - main");
    expect(stripAgentStatusMarkers("notes - Workingham")).toBe(
      "notes - Workingham",
    );
  });
});
