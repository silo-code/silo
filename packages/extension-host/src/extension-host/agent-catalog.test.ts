import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENT_CATALOG,
  SILO_HOOK_MARKER,
  TRACK_SCRIPT_REL,
  buildTrackSessionScript,
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

  it("every hook command is a plain, single-line shell invocation — no obfuscation", () => {
    for (const a of hookInstallableAgents()) {
      const command = a.resume.buildCommand();
      expect(command).toContain(SILO_HOOK_MARKER);
      expect(command).not.toContain("\n");
      expect(a.resume.marker).toBe(SILO_HOOK_MARKER);
      // The whole point of RFC 0019: none of the patterns endpoint-security
      // tools flag. No base64, no exec-of-decoded-payload, no python.
      expect(command).not.toMatch(/base64|b64decode|exec\(|python/i);
      // It's just `sh "$HOME/<script>" <id> # <marker>` — invokes the shared
      // script by its $HOME-relative path (RFC 0019 decision A).
      expect(command).toMatch(
        new RegExp(
          `^sh "\\$HOME/${TRACK_SCRIPT_REL}" ${a.id} # ${SILO_HOOK_MARKER}$`,
        ),
      );
    }
  });

  it("every hook command identifies Silo within the first 80 characters", () => {
    // A hook-trust review UI (Codex's `/hooks`) shows a truncated command
    // preview; SILO_HOOK_MARKER is a trailing comment that never survives that
    // truncation — so identification must be near the front. The self-naming
    // `.silo/…/track-session.sh` path does that now (no prefix hack needed).
    for (const a of hookInstallableAgents()) {
      const command = a.resume.buildCommand();
      expect(command.slice(0, 80).toLowerCase()).toContain("silo");
    }
  });
});

describe("buildTrackSessionScript", () => {
  it("is a legible POSIX shell script with no obfuscation or extra runtime dep", () => {
    const script = buildTrackSessionScript();
    expect(script.startsWith("#!/bin/sh")).toBe(true);
    expect(script).toContain(SILO_HOOK_MARKER);
    expect(script).not.toMatch(/base64|b64decode|exec\(|python|eval/i);
    // Targeted process lookups only — never a broad `ps aux` enumeration.
    expect(script).toContain("ps -p");
    expect(script).not.toMatch(/ps\s+aux|ps\s+-e/);
  });

  it("templates its known-agent list from the catalog's leaderNames (single source of truth)", () => {
    const script = buildTrackSessionScript();
    const known = [...new Set(AGENT_CATALOG.flatMap((a) => a.leaderNames))];
    // Every catalog leader name appears in the script's KNOWN list…
    for (const name of known) expect(script).toContain(name);
    // …and the KNOWN line is exactly that set (so nothing hand-maintained drifts).
    const line = script.split("\n").find((l) => l.startsWith("KNOWN="));
    expect(line).toBe(`KNOWN="${known.join(" ")}"`);
  });

  it("passes `sh -n` syntax validation", () => {
    const dir = mkdtempSync(join(tmpdir(), "silo-hook-syntax-"));
    try {
      const p = join(dir, "track-session.sh");
      writeFileSync(p, buildTrackSessionScript());
      // Throws (non-zero exit) if the generated script is not valid POSIX sh.
      execFileSync("sh", ["-n", p], { stdio: "pipe" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("emits a valid, cwd-free event line for both session-id spellings and never breaks on a hostile cwd", () => {
    const dir = mkdtempSync(join(tmpdir(), "silo-hook-run-"));
    try {
      const scriptPath = join(dir, "track-session.sh");
      writeFileSync(scriptPath, buildTrackSessionScript());
      const home = join(dir, "home");

      const run = (payload: string): string | null => {
        execFileSync("sh", [scriptPath, "claude"], {
          input: payload,
          env: { ...process.env, HOME: home },
          stdio: ["pipe", "pipe", "pipe"],
        });
        try {
          return readFileSync(
            join(home, ".silo/agent-hooks/events.jsonl"),
            "utf8",
          ).trim();
        } catch {
          return null;
        }
      };
      const lastLine = (raw: string | null) =>
        raw ? raw.split("\n").filter(Boolean).pop()! : null;

      const snake = lastLine(
        run('{"session_id":"019fa9d2-1234-7abc-8def-0123456789ab","cwd":"/x"}'),
      );
      expect(snake).not.toBeNull();
      const snakeObj = JSON.parse(snake!);
      expect(snakeObj.sessionId).toBe("019fa9d2-1234-7abc-8def-0123456789ab");
      expect(snakeObj.agent).toBe("claude");
      expect(Number.isInteger(snakeObj.pid) && snakeObj.pid > 0).toBe(true);
      expect(Number.isNaN(Date.parse(snakeObj.timestamp))).toBe(false);
      expect("cwd" in snakeObj).toBe(false); // decision B: cwd is dropped

      const camel = lastLine(
        run('{"cwd":"/y","sessionId":"aaaa1111-2222-3333-4444-555566667777"}'),
      );
      expect(JSON.parse(camel!).sessionId).toBe(
        "aaaa1111-2222-3333-4444-555566667777",
      );

      // A quote inside cwd must NOT corrupt the line (the whole reason B drops
      // cwd) — the session id still lands as valid JSON.
      const hostile = lastLine(
        run(
          '{"session_id":"dddd0000-1111-2222-3333-444455556666","cwd":"/we\\"ird"}',
        ),
      );
      expect(JSON.parse(hostile!).sessionId).toBe(
        "dddd0000-1111-2222-3333-444455556666",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes nothing when the payload carries no session id", () => {
    const dir = mkdtempSync(join(tmpdir(), "silo-hook-empty-"));
    try {
      const scriptPath = join(dir, "track-session.sh");
      writeFileSync(scriptPath, buildTrackSessionScript());
      const home = join(dir, "home");
      execFileSync("sh", [scriptPath, "claude"], {
        input: '{"cwd":"/nope"}',
        env: { ...process.env, HOME: home },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let wrote = true;
      try {
        readFileSync(join(home, ".silo/agent-hooks/events.jsonl"), "utf8");
      } catch {
        wrote = false;
      }
      expect(wrote).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
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
    expect(agentByLeader("agent")?.id).toBe("cursor");
    expect(agentByLeader("copilot")?.id).toBe("copilot");
  });

  it("matches a known agent by full-path leader", () => {
    expect(agentByLeader("/opt/homebrew/bin/claude")?.id).toBe("claude");
    expect(agentByLeader("/usr/local/bin/cursor-agent")?.id).toBe("cursor");
    expect(agentByLeader("/Users/x/.local/bin/agent")?.id).toBe("cursor");
  });

  it("returns undefined for a plain shell / unknown program", () => {
    expect(agentByLeader("zsh")).toBeUndefined();
    expect(agentByLeader("/bin/bash")).toBeUndefined();
    // "cursor" (the editor) is not "cursor-agent" / "agent" (the CLI).
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

  it("includes every hook-capable agent (Claude, Codex, Cursor, Copilot)", () => {
    const ids = hookInstallableAgents().map((a) => a.id);
    expect(ids).toContain("claude");
    expect(ids).toContain("codex");
    expect(ids).toContain("cursor");
    expect(ids).toContain("copilot");
  });

  it("assigns the correct installStrategy per agent", () => {
    expect(agentById("claude")?.resume).toMatchObject({
      kind: "hook",
      installStrategy: "claude-settings",
    });
    expect(agentById("codex")?.resume).toMatchObject({
      kind: "hook",
      installStrategy: "claude-settings",
    });
    expect(agentById("cursor")?.resume).toMatchObject({
      kind: "hook",
      installStrategy: "cursor-hooks-json",
    });
    expect(agentById("copilot")?.resume).toMatchObject({
      kind: "hook",
      installStrategy: "copilot-hooks-dir",
    });
  });
});

describe("buildResumeCommand", () => {
  it("produces the agent-specific exact resume command", () => {
    for (const a of hookInstallableAgents()) {
      expect(a.resume.buildResumeCommand("SID123")).toContain("SID123");
    }
    const claude = agentById("claude");
    const codex = agentById("codex");
    const cursor = agentById("cursor");
    const copilot = agentById("copilot");
    if (claude?.resume.kind === "hook") {
      expect(claude.resume.buildResumeCommand("x")).toBe("claude --resume x");
    }
    if (codex?.resume.kind === "hook") {
      expect(codex.resume.buildResumeCommand("x")).toBe("codex resume x");
    }
    if (cursor?.resume.kind === "hook") {
      expect(cursor.resume.buildResumeCommand("x")).toBe("agent --resume x");
    }
    if (copilot?.resume.kind === "hook") {
      expect(copilot.resume.buildResumeCommand("x")).toBe("copilot --resume=x");
    }
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
