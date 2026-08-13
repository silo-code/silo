import { describe, it, expect, vi } from "vitest";
import {
  deriveTitle,
  formatTitle,
  programName,
  tmuxStatusTitle,
  type TitleInputs,
} from "./terminal-title";

/** Inputs with no signals at all; each test turns on the ones it's about. */
function inputs(overrides: Partial<TitleInputs> = {}): TitleInputs {
  return {
    oscTitle: "",
    fg: null,
    tmuxLine: () => "",
    restoredTitle: "",
    ...overrides,
  };
}

const running = (leader: string) => ({ atPrompt: false, leader });
const atPrompt = (leader: string) => ({ atPrompt: true, leader });

describe("programName", () => {
  it("strips the login dash and any directory", () => {
    expect(programName("-zsh")).toBe("zsh");
    expect(programName("/opt/homebrew/bin/node")).toBe("node");
    expect(programName(" claude ")).toBe("claude");
  });
});

describe("tmuxStatusTitle", () => {
  it("returns the quoted text on the row, trimmed", () => {
    expect(tmuxStatusTitle('[0] 0:"build server"* "extra"')).toBe(
      "build server",
    );
    expect(tmuxStatusTitle("no quotes here")).toBe("");
  });
});

describe("formatTitle", () => {
  it("falls back for an empty title and ellipsizes long ones", () => {
    expect(formatTitle("")).toBe("Terminal");
    expect(formatTitle("short")).toBe("short");
    expect(formatTitle("x".repeat(32))).toBe("x".repeat(32));
    expect(formatTitle("x".repeat(33))).toBe("x".repeat(31) + "…");
  });
});

describe("deriveTitle priority", () => {
  it("1. a custom name outranks everything", () => {
    expect(
      deriveTitle(
        inputs({
          customName: "deploy",
          oscTitle: "Fix the flaky test",
          fg: running("claude"),
          tmuxLine: () => "tmux window",
        }),
      ),
    ).toEqual({ text: "deploy", source: "custom" });
  });

  it("2. an OSC title outranks the process name while a program runs", () => {
    expect(
      deriveTitle(
        inputs({ oscTitle: "Fix the flaky test", fg: running("claude") }),
      ),
    ).toEqual({ text: "Fix the flaky test", source: "osc" });
  });

  it("2. an OSC title is used when the foreground is unknown", () => {
    expect(deriveTitle(inputs({ oscTitle: "vim README.md" }))).toEqual({
      text: "vim README.md",
      source: "osc",
    });
  });

  it("2. a stale OSC title is dropped once we're back at a prompt (N1a)", () => {
    expect(
      deriveTitle(
        inputs({ oscTitle: "Fix the flaky test", fg: atPrompt("-zsh") }),
      ),
    ).toEqual({ text: "zsh", source: "process" });
  });

  it("3. a running program with no OSC title shows its own name (N1b)", () => {
    expect(deriveTitle(inputs({ fg: running("/usr/bin/vim") }))).toEqual({
      text: "vim",
      source: "process",
    });
  });

  it("4. falls back to the tmux status line", () => {
    expect(deriveTitle(inputs({ tmuxLine: () => "build server" }))).toEqual({
      text: "build server",
      source: "tmux",
    });
  });

  it("5. shows the shell's name at a prompt with nothing better", () => {
    expect(deriveTitle(inputs({ fg: atPrompt("-zsh") }))).toEqual({
      text: "zsh",
      source: "process",
    });
  });

  it("leaves the title alone when no rule matches", () => {
    expect(deriveTitle(inputs())).toBeNull();
  });

  it("does not scrape tmux when an earlier rule answers", () => {
    const tmuxLine = vi.fn(() => "build server");
    deriveTitle(inputs({ oscTitle: "Fix the flaky test", tmuxLine }));
    expect(tmuxLine).not.toHaveBeenCalled();
  });
});

describe("deriveTitle after a reattach", () => {
  // An app restart or a workspace switch remounts the panel: the restored
  // buffer is a cell snapshot with no escape sequences, so the agent's OSC
  // title is gone even though the agent is still running.
  it("keeps the restored title instead of the running program's name", () => {
    expect(
      deriveTitle(
        inputs({ fg: running("claude"), restoredTitle: "Fix the flaky test" }),
      ),
    ).toBeNull();
  });

  it("still prefers a fresh OSC title over the restored one", () => {
    expect(
      deriveTitle(
        inputs({
          oscTitle: "Review the PR",
          fg: running("claude"),
          restoredTitle: "Fix the flaky test",
        }),
      ),
    ).toEqual({ text: "Review the PR", source: "osc" });
  });

  it("replaces the restored title with the shell once the agent exits", () => {
    expect(
      deriveTitle(
        inputs({ fg: atPrompt("-zsh"), restoredTitle: "Fix the flaky test" }),
      ),
    ).toEqual({ text: "zsh", source: "process" });
  });

  it("does not let the restored title outlive a rename", () => {
    expect(
      deriveTitle(
        inputs({
          customName: "agent",
          fg: running("claude"),
          restoredTitle: "Fix the flaky test",
        }),
      ),
    ).toEqual({ text: "agent", source: "custom" });
  });

  it("holds the restored title even when tmux has a status line", () => {
    // Rule 3 answers first for a running program, so a quoted string that
    // happens to be on the agent's last row can't hijack the tab either.
    expect(
      deriveTitle(
        inputs({
          fg: running("claude"),
          tmuxLine: () => "some quoted text",
          restoredTitle: "Fix the flaky test",
        }),
      ),
    ).toBeNull();
  });

  it("derives normally once the restored title has been superseded", () => {
    expect(deriveTitle(inputs({ fg: running("claude") }))).toEqual({
      text: "claude",
      source: "process",
    });
  });
});
