import { describe, it, expect } from "vitest";
import {
  AGENT_CATALOG,
  SILO_HOOK_MARKER,
  agentById,
  agentByLeader,
  hookInstallableAgents,
  leaderBasename,
  detectFromOsc,
  detectIdleAfterWorking,
  detectFromOutput,
} from "./agent-catalog";

describe("catalog integrity", () => {
  it("has unique agent ids", () => {
    const ids = AGENT_CATALOG.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry carries provenance for the audit skill", () => {
    for (const a of AGENT_CATALOG) {
      expect(a.contract.length).toBeGreaterThan(0);
      expect(a.upstreamRefs.length).toBeGreaterThan(0);
      expect(a.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("every hook-resume command embeds the Silo marker and is single-line", () => {
    for (const a of hookInstallableAgents()) {
      const command = a.resume.buildCommand();
      expect(command).toContain(SILO_HOOK_MARKER);
      expect(command).not.toContain("\n");
      expect(a.resume.marker).toBe(SILO_HOOK_MARKER);
    }
  });

  it("every hook command identifies Silo within the first 80 characters", () => {
    // Confirmed in testing: a hook-trust review UI (Codex's `/hooks`) shows a
    // truncated command preview, and SILO_HOOK_MARKER is a trailing comment
    // that never survives that truncation — so identification must be near
    // the front, not just embedded anywhere in the string.
    for (const a of hookInstallableAgents()) {
      const command = a.resume.buildCommand();
      expect(command.slice(0, 80).toLowerCase()).toContain("silo");
    }
  });
});

describe("leaderBasename", () => {
  it("returns a bare name unchanged", () => {
    expect(leaderBasename("claude")).toBe("claude");
  });

  it("strips a leading path (Bun-compiled install case)", () => {
    expect(leaderBasename("/Users/x/.local/bin/claude")).toBe("claude");
  });
});

describe("agentByLeader", () => {
  it("matches a known agent by bare leader name", () => {
    expect(agentByLeader("claude")?.id).toBe("claude");
    expect(agentByLeader("codex")?.id).toBe("codex");
    expect(agentByLeader("cursor-agent")?.id).toBe("cursor");
  });

  it("matches a known agent by full-path leader", () => {
    expect(agentByLeader("/opt/homebrew/bin/claude")?.id).toBe("claude");
    expect(agentByLeader("/usr/local/bin/cursor-agent")?.id).toBe("cursor");
  });

  it("returns undefined for a plain shell / unknown program", () => {
    expect(agentByLeader("zsh")).toBeUndefined();
    expect(agentByLeader("/bin/bash")).toBeUndefined();
    // "cursor" (the editor) is not "cursor-agent" (the CLI) — don't match it.
    expect(agentByLeader("cursor")).toBeUndefined();
  });
});

describe("agentById", () => {
  it("finds agents by id", () => {
    expect(agentById("claude")?.displayName).toBe("Claude Code");
    expect(agentById("codex")?.displayName).toBe("Codex CLI");
    expect(agentById("cursor")?.displayName).toBe("Cursor Agent");
  });

  it("returns undefined for an unknown id", () => {
    expect(agentById("nope")).toBeUndefined();
  });
});

describe("hookInstallableAgents", () => {
  it("only returns entries with a hook resume path", () => {
    for (const a of hookInstallableAgents()) {
      expect(a.resume.kind).toBe("hook");
      expect(a.resume.configPath.length).toBeGreaterThan(0);
    }
  });

  it("includes the hook-capable agents (Claude, Codex) but not Cursor", () => {
    const ids = hookInstallableAgents().map((a) => a.id);
    expect(ids).toContain("claude");
    expect(ids).toContain("codex");
    // Cursor has a hook upstream, but Silo can't auto-install its differently
    // shaped config yet — so it must NOT appear as an install toggle.
    expect(ids).not.toContain("cursor");
  });
});

describe("buildResumeCommand", () => {
  it("produces the agent-specific exact resume command", () => {
    for (const a of hookInstallableAgents()) {
      expect(a.resume.buildResumeCommand("SID123")).toContain("SID123");
    }
    const claude = agentById("claude");
    const codex = agentById("codex");
    if (claude?.resume.kind === "hook") {
      expect(claude.resume.buildResumeCommand("x")).toBe("claude --resume x");
    }
    if (codex?.resume.kind === "hook") {
      expect(codex.resume.buildResumeCommand("x")).toBe("codex resume x");
    }
  });

  it("Cursor has no auto-install hook path (resume kind 'none')", () => {
    expect(agentById("cursor")?.resume.kind).toBe("none");
  });
});

describe("postInstallNote", () => {
  it("Codex carries a note about Codex's required hook-trust step", () => {
    const codex = agentById("codex");
    expect(
      codex?.resume.kind === "hook" && codex.resume.postInstallNote,
    ).toMatch(/\/hooks/);
  });

  it("Claude needs no post-install step (its hooks run immediately)", () => {
    const claude = agentById("claude");
    expect(
      claude?.resume.kind === "hook" && claude.resume.postInstallNote,
    ).toBeUndefined();
  });
});

describe("detectFromOsc", () => {
  it("detects Claude's braille spinner as working", () => {
    // U+2800 is the start of the braille range Claude uses for its spinner.
    const result = detectFromOsc(0, "⠁ thinking");
    expect(result).toEqual({
      status: "working",
      source: "agent",
      timer: "schedule",
    });
  });

  it("detects Claude's idle marker as idle", () => {
    const result = detectFromOsc(0, "✳ awaiting");
    expect(result).toEqual({ status: "idle", source: "agent", timer: "clear" });
  });

  it("falls back to the generic OSC-133 shell detector", () => {
    const result = detectFromOsc(133, "C");
    expect(result).toEqual({
      status: "working",
      source: "shell",
      timer: "schedule",
    });
  });

  it("returns null for an unrecognized sequence", () => {
    expect(detectFromOsc(0, "plain text")).toBeNull();
  });

  it("detects Codex's braille spinner as working (shared with Claude)", () => {
    expect(detectFromOsc(0, "⠋ my-project")).toEqual({
      status: "working",
      source: "agent",
      timer: "schedule",
    });
  });

  it("detects Codex's own idle signals (empty title, action-required)", () => {
    expect(detectFromOsc(0, "")).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
    expect(detectFromOsc(0, "[ ! ] Action Required - my-project")).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
  });

  it("detects Cursor Agent's OSC 0 status titles", () => {
    expect(detectFromOsc(0, "Cursor Agent - ⏳ Working ...")).toEqual({
      status: "working",
      source: "agent",
      timer: "schedule",
    });
    expect(detectFromOsc(0, "Cursor Agent - ✅ Ready")).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
  });

  it("detects Copilot's OSC 9;4 progress payloads", () => {
    expect(detectFromOsc(9, "4;1")).toEqual({
      status: "working",
      source: "agent",
    });
    expect(detectFromOsc(9, "4;0")).toEqual({
      status: "idle",
      source: "agent",
    });
  });
});

describe("detectIdleAfterWorking", () => {
  it("infers Codex idle from a plain title once an agent-working phase is active", () => {
    expect(detectIdleAfterWorking(0, "my-project", true)).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
  });

  it("returns null when no terminal was agent-working", () => {
    expect(detectIdleAfterWorking(0, "my-project", false)).toBeNull();
  });

  it("returns null for signals other detectors already own (braille, ✳, empty)", () => {
    expect(detectIdleAfterWorking(0, "⠋ my-project", true)).toBeNull();
    expect(detectIdleAfterWorking(0, "✳ waiting…", true)).toBeNull();
    expect(detectIdleAfterWorking(0, "", true)).toBeNull();
  });

  it("returns null — no other catalog agent defines idleAfterWorking", () => {
    // Claude/Cursor/Copilot don't need this contextual fallback; only Codex
    // does. Confirms adding a new catalog entry without one doesn't break
    // dispatch (no throw, clean null).
    expect(agentById("claude")?.idleAfterWorking).toBeUndefined();
    expect(agentById("cursor")?.idleAfterWorking).toBeUndefined();
    expect(agentById("copilot")?.idleAfterWorking).toBeUndefined();
  });
});

describe("detectFromOutput", () => {
  it("detects Cursor Agent's raw-output spinner frames", () => {
    expect(detectFromOutput("prefix ⠀⠞ suffix")).toEqual({
      status: "working",
      source: "agent",
      timer: "schedule-agent",
    });
  });

  it("returns null for output with no known spinner frame", () => {
    expect(detectFromOutput("hello world")).toBeNull();
  });

  it("only Cursor defines an outputDetector", () => {
    expect(agentById("claude")?.outputDetector).toBeUndefined();
    expect(agentById("codex")?.outputDetector).toBeUndefined();
    expect(agentById("copilot")?.outputDetector).toBeUndefined();
    expect(agentById("cursor")?.outputDetector).toBeDefined();
  });
});
