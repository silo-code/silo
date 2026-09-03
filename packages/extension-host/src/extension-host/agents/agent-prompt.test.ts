import { describe, it, expect } from "vitest";
import {
  MAX_PROMPT_BYTES,
  composePromptLaunchLine,
  heredocDelimiter,
  profileAcceptsPrompt,
  resolveProfileAgentId,
  sanitizePromptForLineEditor,
  shellDialect,
  type ComposePromptInput,
} from "./agent-prompt";

// The phase's risk is concentrated in this one pure module, so the coverage is
// too: what a line editor would act on (sanitizer), which shells Silo can
// quote exactly (dialect), and the one place shell syntax is written
// (composition + its four refusals).

const compose = (over: Partial<ComposePromptInput> = {}) =>
  composePromptLaunchLine({
    launchLine: "claude",
    prompt: "fix the CI",
    agentId: "claude",
    delivery: { kind: "argv" },
    dialect: "posix",
    ...over,
  });

/** The payload a composed POSIX line carries, between the heredoc delimiters. */
function heredocBody(line: string): string {
  const m = /<<'([A-Z_0-9]+)'\n([\s\S]*)\n\1\n\)"$/.exec(line);
  if (!m) throw new Error(`not a heredoc line: ${JSON.stringify(line)}`);
  return m[2];
}

describe("sanitizePromptForLineEditor", () => {
  it("normalizes CRLF and lone CR to LF", () => {
    // A bare CR typed into a line editor submits the line, splitting the
    // payload mid-heredoc.
    expect(sanitizePromptForLineEditor("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });

  it("strips a CSI sequence whole, leaving no parameter bytes behind", () => {
    expect(
      sanitizePromptForLineEditor("\x1b[38;2;118;118;118mred\x1b[0m"),
    ).toBe("red");
    // The failure mode this guards: removing the ESC alone would leave "[31m".
    expect(sanitizePromptForLineEditor("\x1b[31mx")).not.toContain("[");
  });

  it("strips an OSC sequence whole, with either terminator", () => {
    expect(sanitizePromptForLineEditor("a\x1b]0;a title\x07b")).toBe("ab");
    expect(sanitizePromptForLineEditor("a\x1b]0;a title\x1b\\b")).toBe("ab");
  });

  it("strips an unterminated OSC rather than leaking its payload", () => {
    expect(sanitizePromptForLineEditor("a\x1b]0;never ends")).toBe("a");
  });

  it("removes remaining C0 and C1 controls but keeps LF", () => {
    expect(sanitizePromptForLineEditor("a\x00b\x07c\x1fd\x9be\nf")).toBe(
      "abcde\nf",
    );
  });

  it("strips a two-byte escape and a charset designator without eating text", () => {
    expect(sanitizePromptForLineEditor("a\x1b7b")).toBe("ab");
    expect(sanitizePromptForLineEditor("a\x1b(Bhello")).toBe("ahello");
  });

  it("expands tabs to spaces", () => {
    // Tab triggers completion rather than inserting.
    expect(sanitizePromptForLineEditor("a\tb")).toBe("a  b");
  });

  it("leaves ordinary text byte-identical", () => {
    const clean = "Fix the flaky test in src/foo.ts — it fails ~1 in 10 runs.";
    expect(sanitizePromptForLineEditor(clean)).toBe(clean);
  });

  it("leaves shell metacharacters alone (quoting is composition's job)", () => {
    const meta = "use $HOME and `date` and $(uname) and \\ and ' and \"";
    expect(sanitizePromptForLineEditor(meta)).toBe(meta);
  });

  it("is idempotent", () => {
    const dirty = "\x1b[1mbold\x1b[0m\r\n\x1b]0;t\x07tab\there";
    const once = sanitizePromptForLineEditor(dirty);
    expect(sanitizePromptForLineEditor(once)).toBe(once);
  });

  it("is total — no input makes it throw", () => {
    const adversarial = [
      "",
      "\x1b",
      "\x1b[",
      "\x1b]",
      "\x1b]0;",
      "\x1b\\",
      "\x1b[?2004h",
      "\u{1f600}\x1b[m\u{1f600}",
      "\x9b31m",
      "\r".repeat(1000),
      "\x1b".repeat(1000),
    ];
    for (const input of adversarial) {
      expect(() => sanitizePromptForLineEditor(input)).not.toThrow();
      expect(typeof sanitizePromptForLineEditor(input)).toBe("string");
    }
  });

  it("preserves non-ASCII text", () => {
    expect(sanitizePromptForLineEditor("café — π ✓ 🎉")).toBe("café — π ✓ 🎉");
  });
});

describe("shellDialect", () => {
  it("maps the POSIX family, by basename or full path", () => {
    for (const shell of ["bash", "zsh", "sh", "dash", "ksh", "mksh", "ash"])
      expect(shellDialect(shell)).toBe("posix");
    expect(shellDialect("/bin/zsh")).toBe("posix");
    expect(shellDialect("/opt/homebrew/bin/bash")).toBe("posix");
  });

  it("maps fish, by basename or full path", () => {
    expect(shellDialect("fish")).toBe("fish");
    expect(shellDialect("/opt/homebrew/bin/fish")).toBe("fish");
  });

  it("refuses a shell it has no exact quoting rule for", () => {
    expect(shellDialect("nu")).toBe("unsupported");
    expect(shellDialect("pwsh")).toBe("unsupported");
    expect(shellDialect("/usr/local/bin/elvish")).toBe("unsupported");
  });

  it("refuses rather than assuming POSIX when nothing is known", () => {
    expect(shellDialect(undefined)).toBe("unsupported");
    expect(shellDialect("")).toBe("unsupported");
    expect(shellDialect("   ")).toBe("unsupported");
  });

  it("normalizes a Windows-style path and extension", () => {
    expect(shellDialect("C:\\Program Files\\Git\\bin\\bash.exe")).toBe("posix");
  });
});

describe("heredocDelimiter", () => {
  it("uses the base delimiter when no line collides", () => {
    expect(heredocDelimiter("fix the CI")).toBe("SILO_PROMPT");
  });

  it("does not suffix for a mid-line occurrence — only a whole line can end a heredoc", () => {
    expect(heredocDelimiter("mention SILO_PROMPT inline")).toBe("SILO_PROMPT");
  });

  it("suffixes when a whole line equals the delimiter", () => {
    expect(heredocDelimiter("a\nSILO_PROMPT\nb")).toBe("SILO_PROMPT_2");
  });

  it("keeps suffixing past a collision with the suffixed form", () => {
    expect(heredocDelimiter("SILO_PROMPT\nSILO_PROMPT_2")).toBe(
      "SILO_PROMPT_3",
    );
  });
});

describe("composePromptLaunchLine — POSIX", () => {
  it("wraps the payload in a quoted heredoc inside a command substitution", () => {
    const result = compose();
    expect(result).toEqual({
      line: "claude \"$(cat <<'SILO_PROMPT'\nfix the CI\nSILO_PROMPT\n)\"",
    });
  });

  it("delivers shell metacharacters as literal text", () => {
    const prompt = "use $HOME `date` $(uname) \\ ; && ' \" and a \\\ntrailer";
    const result = compose({ prompt });
    if (!("line" in result)) throw new Error("expected a line");
    // A quoted heredoc delimiter kills expansion by construction, so the
    // payload appears verbatim between the delimiters.
    expect(heredocBody(result.line)).toBe(prompt);
  });

  it("preserves a multi-line prompt's line breaks", () => {
    const result = compose({ prompt: "line one\nline two\nline three" });
    if (!("line" in result)) throw new Error("expected a line");
    expect(heredocBody(result.line)).toBe("line one\nline two\nline three");
  });

  it("keeps the configDir env prefix leading and the command verbatim", () => {
    const result = compose({
      launchLine: "CLAUDE_CONFIG_DIR='/Users/me/.claude-work' claude --verbose",
    });
    if (!("line" in result)) throw new Error("expected a line");
    expect(
      result.line.startsWith(
        "CLAUDE_CONFIG_DIR='/Users/me/.claude-work' claude --verbose \"$(",
      ),
    ).toBe(true);
  });

  it("returns \\n separators, never \\r — the send seam owns that conversion", () => {
    const result = compose({ prompt: "a\nb" });
    if (!("line" in result)) throw new Error("expected a line");
    expect(result.line).not.toContain("\r");
    expect(result.line).toContain("\n");
  });

  it("still delivers a payload that contains the default delimiter as a line", () => {
    const result = compose({ prompt: "before\nSILO_PROMPT\nafter" });
    if (!("line" in result)) throw new Error("expected a line");
    expect(result.line).toContain("<<'SILO_PROMPT_2'");
    expect(heredocBody(result.line)).toBe("before\nSILO_PROMPT\nafter");
  });

  it("inserts the flag between the command and the payload for a flag agent", () => {
    const result = compose({
      launchLine: "opencode",
      agentId: "opencode",
      delivery: { kind: "flag", flag: "--prompt" },
    });
    expect(result).toEqual({
      line: "opencode --prompt \"$(cat <<'SILO_PROMPT'\nfix the CI\nSILO_PROMPT\n)\"",
    });
  });

  it("sanitizes before composing", () => {
    const result = compose({ prompt: "\x1b[31mred\x1b[0m\r\nnext\there" });
    if (!("line" in result)) throw new Error("expected a line");
    expect(heredocBody(result.line)).toBe("red\nnext  here");
  });
});

describe("composePromptLaunchLine — fish", () => {
  it("uses an exact single-quoted literal instead of a heredoc", () => {
    const result = compose({ dialect: "fish" });
    expect(result).toEqual({ line: "claude 'fix the CI'" });
  });

  it("escapes only backslash and single quote", () => {
    const result = compose({ dialect: "fish", prompt: `a\\b'c"d$e` });
    expect(result).toEqual({ line: `claude 'a\\\\b\\'c"d$e'` });
  });

  it("spans newlines inside the quotes", () => {
    const result = compose({ dialect: "fish", prompt: "fix the\nCI" });
    expect(result).toEqual({ line: "claude 'fix the\nCI'" });
  });

  it("places a flag agent's flag before the literal", () => {
    const result = compose({
      dialect: "fish",
      launchLine: "copilot",
      agentId: "copilot",
      delivery: { kind: "flag", flag: "--interactive" },
    });
    expect(result).toEqual({ line: "copilot --interactive 'fix the CI'" });
  });
});

describe("composePromptLaunchLine — refusals", () => {
  it("refuses when the profile resolves to no catalog agent", () => {
    expect(compose({ agentId: undefined, delivery: undefined })).toEqual({
      refusal: "no-agent",
    });
  });

  it("refuses when the resolved agent declares no promptDelivery", () => {
    expect(compose({ delivery: undefined })).toEqual({
      refusal: "agent-takes-none",
    });
  });

  it("refuses a shell it cannot quote exactly", () => {
    expect(compose({ dialect: "unsupported" })).toEqual({
      refusal: "unsupported-shell",
    });
  });

  it("accepts a sanitized payload at exactly the byte limit", () => {
    const result = compose({ prompt: "x".repeat(MAX_PROMPT_BYTES) });
    expect("line" in result).toBe(true);
  });

  it("refuses one byte over the limit", () => {
    expect(compose({ prompt: "x".repeat(MAX_PROMPT_BYTES + 1) })).toEqual({
      refusal: "too-large",
    });
  });

  it("measures bytes, not characters", () => {
    // "é" is two UTF-8 bytes, so half the limit in characters is exactly the
    // limit in bytes — and one more character is over.
    const atLimit = "é".repeat(MAX_PROMPT_BYTES / 2);
    expect("line" in compose({ prompt: atLimit })).toBe(true);
    expect(compose({ prompt: `${atLimit}é` })).toEqual({
      refusal: "too-large",
    });
  });

  it("measures the payload after sanitizing, not before", () => {
    // Escape sequences that get stripped must not count against the limit.
    const prompt = "\x1b[31m".repeat(4096) + "x".repeat(MAX_PROMPT_BYTES);
    expect("line" in compose({ prompt })).toBe(true);
  });

  it("checks no-agent before every other refusal", () => {
    // A profile with no agent on an unsupported shell reports the fixable
    // configuration problem, not the environmental one.
    expect(
      compose({
        agentId: undefined,
        delivery: undefined,
        dialect: "unsupported",
      }),
    ).toEqual({ refusal: "no-agent" });
  });
});

describe("resolveProfileAgentId / profileAcceptsPrompt", () => {
  it("prefers an explicit assumedAgentId", () => {
    expect(
      resolveProfileAgentId({ assumedAgentId: "pi", command: "claude" }),
    ).toBe("pi");
  });

  it("falls back to matching the command text", () => {
    expect(
      resolveProfileAgentId({
        assumedAgentId: undefined,
        command: "claude-work --foo",
      }),
    ).toBe("claude");
  });

  it("resolves to nothing for a command that matches no catalog agent", () => {
    expect(
      resolveProfileAgentId({ assumedAgentId: undefined, command: "my-agent" }),
    ).toBeUndefined();
  });

  it("ignores an assumedAgentId the catalog does not carry", () => {
    // A profile written against a dropped agent falls through to the command
    // match rather than being taken at its word — otherwise a refusal names an
    // agent that does not exist.
    expect(
      resolveProfileAgentId({ assumedAgentId: "gone", command: "claude" }),
    ).toBe("claude");
    expect(
      resolveProfileAgentId({ assumedAgentId: "gone", command: "my-agent" }),
    ).toBeUndefined();
  });

  it("reports acceptsPrompt from the catalog, for both delivery kinds", () => {
    expect(
      profileAcceptsPrompt({ assumedAgentId: "claude", command: "claude" }),
    ).toBe(true);
    expect(
      profileAcceptsPrompt({ assumedAgentId: "opencode", command: "opencode" }),
    ).toBe(true);
    expect(
      profileAcceptsPrompt({ assumedAgentId: "copilot", command: "copilot" }),
    ).toBe(true);
  });

  it("reports false when the profile resolves to no catalog agent", () => {
    expect(
      profileAcceptsPrompt({ assumedAgentId: undefined, command: "my-agent" }),
    ).toBe(false);
  });
});
