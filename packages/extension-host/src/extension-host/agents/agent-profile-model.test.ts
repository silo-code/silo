import { describe, it, expect } from "vitest";
import {
  slugifyProfileId,
  validateProfileDraft,
  posixSingleQuote,
  expandTilde,
  buildLaunchLine,
  profileLaunchLine,
  fallbackAgentForCommand,
  profileCommandId,
  resolveDefaultProfile,
  renameRetiresBinding,
} from "./agent-profile-model";
import type { AgentProfile } from "../../state/types";

const profile = (over: Partial<AgentProfile>): AgentProfile => ({
  id: "p",
  label: "P",
  command: "claude",
  ...over,
});

describe("slugifyProfileId", () => {
  it("lowercases, strips punctuation, collapses runs, trims hyphens", () => {
    expect(slugifyProfileId("Claude (work)")).toBe("claude-work");
    expect(slugifyProfileId("  Claude   Work  ")).toBe("claude-work");
    expect(slugifyProfileId("--Claude--")).toBe("claude");
    expect(slugifyProfileId("Café Codé")).toBe("caf-cod");
  });

  it("returns empty string for an all-punctuation label", () => {
    expect(slugifyProfileId("!!!")).toBe("");
    expect(slugifyProfileId("")).toBe("");
  });
});

describe("validateProfileDraft", () => {
  const existing = [profile({ id: "claude-work", label: "W", command: "cw" })];

  it("accepts a well-formed, unique draft", () => {
    const errs = validateProfileDraft(
      { id: "claude-home", label: "Home", command: "claude" },
      existing,
    );
    expect(errs).toEqual({});
  });

  it("rejects an empty label or command after trim", () => {
    const errs = validateProfileDraft(
      { id: "x", label: "  ", command: "  " },
      existing,
    );
    expect(errs.label).toBeTruthy();
    expect(errs.command).toBeTruthy();
  });

  it("rejects a bad id shape", () => {
    expect(
      validateProfileDraft({ id: "Bad Id", label: "L", command: "c" }, existing)
        .id,
    ).toBeTruthy();
    expect(
      validateProfileDraft({ id: "-lead", label: "L", command: "c" }, existing)
        .id,
    ).toBeTruthy();
    expect(
      validateProfileDraft({ id: "", label: "L", command: "c" }, existing).id,
    ).toBeTruthy();
  });

  it("rejects a collision with another profile", () => {
    expect(
      validateProfileDraft(
        { id: "claude-work", label: "L", command: "c" },
        existing,
      ).id,
    ).toBeTruthy();
  });

  it("permits a profile keeping its own id on edit", () => {
    expect(
      validateProfileDraft(
        { id: "claude-work", label: "L", command: "c" },
        existing,
        "claude-work",
      ),
    ).toEqual({});
  });
});

describe("posixSingleQuote", () => {
  it("wraps and escapes embedded single quotes", () => {
    expect(posixSingleQuote("/a/b")).toBe("'/a/b'");
    expect(posixSingleQuote("/it's/here")).toBe("'/it'\\''s/here'");
    expect(posixSingleQuote("$x `y`")).toBe("'$x `y`'");
  });
});

describe("expandTilde", () => {
  it("expands bare ~ and ~/x, leaves absolute and ~user alone", () => {
    expect(expandTilde("~", "/home/d")).toBe("/home/d");
    expect(expandTilde("~/x", "/home/d")).toBe("/home/d/x");
    expect(expandTilde("/abs/path", "/home/d")).toBe("/abs/path");
    expect(expandTilde("~bob/x", "/home/d")).toBe("~bob/x");
  });
});

describe("buildLaunchLine", () => {
  it("is the command verbatim with no configDir", () => {
    expect(
      buildLaunchLine(profile({ command: "claude-work" }), "CLAUDE_CONFIG_DIR"),
    ).toBe("claude-work");
  });

  it("prefixes the env var when configDir and a var are both present", () => {
    expect(
      buildLaunchLine(
        profile({ command: "claude-work", configDir: "/Users/d/.claude-work" }),
        "CLAUDE_CONFIG_DIR",
      ),
    ).toBe("CLAUDE_CONFIG_DIR='/Users/d/.claude-work' claude-work");
  });

  it("emits no prefix when the agent has no configDirEnvVar", () => {
    expect(
      buildLaunchLine(
        profile({ command: "cursor-agent", configDir: "/x" }),
        undefined,
      ),
    ).toBe("cursor-agent");
  });

  it("escapes a configDir containing a quote", () => {
    expect(
      buildLaunchLine(
        profile({ command: "claude", configDir: "/it's/dir" }),
        "CLAUDE_CONFIG_DIR",
      ),
    ).toBe("CLAUDE_CONFIG_DIR='/it'\\''s/dir' claude");
  });
});

describe("profileLaunchLine", () => {
  it("resolves the env var from the profile's own assumedAgentId", () => {
    expect(
      profileLaunchLine(
        profile({
          command: "claude-work",
          configDir: "/Users/d/.claude-work",
          assumedAgentId: "claude",
        }),
      ),
    ).toBe("CLAUDE_CONFIG_DIR='/Users/d/.claude-work' claude-work");
  });

  it("emits no prefix when the resolved agent has no configDirEnvVar", () => {
    expect(
      profileLaunchLine(
        profile({
          command: "cursor-agent",
          configDir: "/x",
          assumedAgentId: "cursor",
        }),
      ),
    ).toBe("cursor-agent");
  });

  it("is the bare command with no configDir or no assumedAgentId", () => {
    expect(
      profileLaunchLine(
        profile({ command: "claude", assumedAgentId: "claude" }),
      ),
    ).toBe("claude");
    expect(
      profileLaunchLine(profile({ command: "claude", configDir: "/x" })),
    ).toBe("claude");
  });
});

describe("fallbackAgentForCommand", () => {
  it("matches the token prefix up to the first -/_ boundary", () => {
    expect(fallbackAgentForCommand("claude-work")).toBe("claude");
    expect(fallbackAgentForCommand("codex_home foo")).toBe("codex");
  });
  it("never substring-matches, and skips tokens under three chars", () => {
    expect(fallbackAgentForCommand("pi")).toBeUndefined();
    expect(fallbackAgentForCommand("pip")).toBeUndefined();
    expect(fallbackAgentForCommand("copilot")).toBe("copilot");
    // "pilot" must not resolve copilot via substring
    expect(fallbackAgentForCommand("pilot")).toBeUndefined();
  });
});

describe("profileCommandId", () => {
  it("spells the one `core.newAgent.<id>` form", () => {
    expect(profileCommandId("claude-work")).toBe("core.newAgent.claude-work");
  });
});

describe("resolveDefaultProfile", () => {
  const a = profile({ id: "a", label: "A" });
  const b = profile({ id: "b", label: "B" });
  const c = profile({ id: "c", label: "C" });

  it("returns the flagged default, wherever it sits in the list", () => {
    expect(resolveDefaultProfile([a, { ...b, default: true }, c])?.id).toBe("b");
  });

  it("falls back to the first profile when none is flagged", () => {
    expect(resolveDefaultProfile([a, b, c])?.id).toBe("a");
  });

  it("is undefined for an empty list", () => {
    expect(resolveDefaultProfile([])).toBeUndefined();
  });
});

describe("renameRetiresBinding", () => {
  const bound = (cmd: string) => cmd === "core.newAgent.old";

  it("is true only when the id changes and the old command is bound", () => {
    expect(renameRetiresBinding("old", "new", bound)).toBe(true);
  });

  it("is false when the id is unchanged", () => {
    expect(renameRetiresBinding("old", "old", bound)).toBe(false);
  });

  it("is false when the old command has no user binding", () => {
    expect(renameRetiresBinding("free", "new", bound)).toBe(false);
  });
});
