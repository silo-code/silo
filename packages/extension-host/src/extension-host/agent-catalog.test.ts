import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENT_CATALOG,
  SILO_HOOK_MARKER,
  TRACK_SCRIPT_REL,
  buildTrackSessionScript,
  buildPiExtensionSource,
  agentById,
  agentByLeader,
  agentByProcessArgs,
  hookInstallableAgents,
  sessionFileAgents,
  leaderBasename,
  detectFromOsc,
  detectIdleAfterWorking,
  detectFromOutput,
} from "./agent-catalog";

describe("leaderBasename — Windows executable names (RFC: Windows agents)", () => {
  // Observed live: the process-tree walk correctly reported `copilot.exe`, and
  // agentByLeader still said "isn't a known agent" — `leaderNames` is written
  // the Unix way (`copilot`), so nothing matched and no agent was ever named
  // on Windows.
  it("strips a .exe extension so Windows leaders match the catalog", () => {
    expect(agentByLeader("copilot.exe")?.id).toBe("copilot");
    expect(agentByLeader("claude.exe")?.id).toBe("claude");
  });

  it("strips the other Windows executable extensions", () => {
    expect(leaderBasename("copilot.cmd")).toBe("copilot");
    expect(leaderBasename("copilot.bat")).toBe("copilot");
    expect(leaderBasename("copilot.COM")).toBe("copilot");
  });

  it("handles a backslash-separated path", () => {
    expect(agentByLeader("C:\\Users\\x\\bin\\copilot.exe")?.id).toBe("copilot");
  });

  it("leaves Unix leaders exactly as they were", () => {
    expect(agentByLeader("/usr/local/bin/copilot")?.id).toBe("copilot");
    expect(leaderBasename("/Users/x/.local/bin/claude")).toBe("claude");
  });

  it("does not strip a dot that isn't an executable extension", () => {
    // A hypothetical `agent.py` must not silently become `agent`.
    expect(leaderBasename("agent.py")).toBe("agent.py");
  });
});

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

/**
 * Write a minimal fake `ps` into `<dir>/bin` and return that bin dir. Prepend
 * it to PATH when running the capture script so its parent-walk resolves in one
 * step (no agent ancestor → immediate fallback) instead of climbing the real
 * test-runner ancestry — which is slow (up to 12 levels × real `ps` spawns),
 * nondeterministic, and, run several times under the parallel commit-gate load,
 * enough to blow vitest's 5s per-test timeout.
 */
function fastPsBin(dir: string): string {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "ps"),
    '#!/bin/sh\ncase "${4%=}" in\n  args) echo "login-shell" ;;\n  ppid) echo 1 ;;\n  pgid) echo "$2" ;;\nesac\n',
  );
  chmodSync(join(bin, "ps"), 0o755);
  return bin;
}

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
      const bin = fastPsBin(dir);

      const run = (payload: string): string | null => {
        execFileSync("sh", [scriptPath, "claude"], {
          input: payload,
          env: {
            ...process.env,
            HOME: home,
            PATH: `${bin}:${process.env.PATH}`,
          },
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
    // Three sequential script runs, each forking ~8 short-lived processes
    // (sh, ps, and their command-substitution subshells) — past vitest's
    // default 5s under the full-monorepo parallel test load the pre-commit
    // hook runs under (confirmed flaky there, not on the logic).
  }, 20000);

  it("resolves the real agent's pgid past a setpgrp worker that only references it (Cursor regression)", () => {
    // Confirmed live: a fresh Cursor session runs the hook from a worker that
    // called setpgrp — so the worker's own pgid (99940) is NOT the terminal's
    // foreground group (cursor-agent's 98143). The worker's argv references the
    // cursor-agent path, so a substring-first walk stops there and writes the
    // wrong pgid → the event never correlates. The walk must prefer an EXACT
    // argv0-basename match and climb past the worker to cursor-agent.
    const dir = mkdtempSync(join(tmpdir(), "silo-hook-walk-"));
    try {
      const bin = join(dir, "bin");
      mkdirSync(bin);
      const scriptPath = join(dir, "track-session.sh");
      writeFileSync(scriptPath, buildTrackSessionScript());
      const home = join(dir, "home");

      // The hook's real PPID (whatever it is under this test runner) is
      // modeled as Cursor's setpgrp WORKER: basename `node`, argv referencing
      // the cursor-agent path (substring-matches but is NOT an exact agent),
      // in its own process group (pgid == its own pid). Its parent is a fake
      // cursor-agent (exact basename) leading the terminal's foreground group.
      // The fake `ps` treats *any* pid other than the agent as that worker, so
      // the test doesn't depend on the real PPID's numeric value (which varies
      // by test-runner pool / pre-commit environment).
      const agentPid = 990001; // fake cursor-agent: pid == pgid (group leader)
      const fakePs = [
        "#!/bin/sh",
        "pid=$2; field=${4%=}",
        `if [ "$pid" = "${agentPid}" ]; then`,
        '  case "$field" in',
        '    args) echo "/Users/x/.local/bin/cursor-agent --use-system-ca /opt/index.js -f" ;;',
        '    ppid) echo "1" ;;',
        `    pgid) echo "${agentPid}" ;;`,
        "  esac",
        "else",
        '  case "$field" in',
        '    args) echo "node --x /Users/x/.local/share/cursor-agent/versions/z/index.js" ;;',
        `    ppid) echo "${agentPid}" ;;`,
        '    pgid) echo "$pid" ;;',
        "  esac",
        "fi",
      ].join("\n");
      writeFileSync(join(bin, "ps"), fakePs);
      chmodSync(join(bin, "ps"), 0o755);

      execFileSync("sh", [scriptPath, "cursor"], {
        input: '{"session_id":"CURSOR-WALK-TEST"}',
        env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const line = readFileSync(
        join(home, ".silo/agent-hooks/events.jsonl"),
        "utf8",
      ).trim();
      const obj = JSON.parse(line);
      // Must be the cursor-agent group (exact match wins), NOT the worker's
      // own group (which would be the hook's real PPID).
      expect(obj.pid).toBe(agentPid);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips the parent walk when SILO_AGENT_PID is set (pi's in-process hook)", () => {
    // Pi's hook runs INSIDE pi (a TypeScript extension), so it knows pi's pid
    // and passes it directly. The walk would resolve the hook's own PPID
    // instead — and pi's argv0 is `node`, so it could only ever match by the
    // two-character substring `pi`, which is exactly the ambiguity this
    // branch avoids.
    const dir = mkdtempSync(join(tmpdir(), "silo-hook-pid-"));
    try {
      const scriptPath = join(dir, "track-session.sh");
      writeFileSync(scriptPath, buildTrackSessionScript());
      const home = join(dir, "home");
      const bin = fastPsBin(dir); // args → "login-shell": no walk match at all
      const agentPid = 777777;

      execFileSync("sh", [scriptPath, "pi"], {
        input: '{"session_id":"PI-PID-TEST","cwd":"/p"}',
        env: {
          ...process.env,
          HOME: home,
          PATH: `${bin}:${process.env.PATH}`,
          SILO_AGENT_PID: String(agentPid),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      const obj = JSON.parse(
        readFileSync(join(home, ".silo/agent-hooks/events.jsonl"), "utf8")
          .trim()
          .split("\n")
          .pop()!,
      );
      // The fake `ps` reports pgid == the pid it is asked about, so this is
      // provably the pid we passed and not the hook's own PPID.
      expect(obj.pid).toBe(agentPid);
      expect(obj.agent).toBe("pi");
      expect(obj.sessionId).toBe("PI-PID-TEST");
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

describe("buildPiExtensionSource", () => {
  it("is a legible, marker-carrying extension with no obfuscation or extra dep", () => {
    const src = buildPiExtensionSource();
    expect(src).toContain(SILO_HOOK_MARKER);
    // Self-identifying header, same bar as the shell script (RFC 0019).
    expect(src.split("\n")[0]).toMatch(
      /Silo session tracking \(getsilo\.dev\)/,
    );
    expect(src).not.toMatch(/base64|atob|eval\(|Function\(|require\(/i);
    // Node built-ins only — nothing that would need an install in pi's
    // extensions directory.
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    for (const spec of imports) {
      expect(
        spec.startsWith("node:") || spec === "@earendil-works/pi-coding-agent", // type-only, erased
      ).toBe(true);
    }
    // No network, no filesystem writes of its own — it only spawns the script.
    expect(src).not.toMatch(/fetch\(|https?:\/\/[^\s"]*\/|writeFile/);
  });

  it("runs the shared capture script and hands it pi's pid", () => {
    const src = buildPiExtensionSource();
    expect(src).toContain(TRACK_SCRIPT_REL);
    expect(src).toContain('spawn("sh"');
    expect(src).toContain("SILO_AGENT_PID: String(process.pid)");
    // Tags the event as pi, and sends the payload the script parses.
    expect(src).toContain('[script, "pi"]');
    expect(src).toContain("session_id: sessionId");
    expect(src).toMatch(/pi\.on\("session_start"/);
  });

  it("passes TypeScript syntax validation", () => {
    const dir = mkdtempSync(join(tmpdir(), "silo-pi-ext-syntax-"));
    try {
      const p = join(dir, "silo-track-session.ts");
      writeFileSync(p, buildPiExtensionSource());
      // The TS analogue of the script's `sh -n`: throws on a syntax error.
      execFileSync("node", ["--experimental-strip-types", "--check", p], {
        stdio: "pipe",
      });
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
    expect(agentByLeader("copilot")?.id).toBe("copilot");
    expect(agentByLeader("grok")?.id).toBe("grok");
    expect(agentByLeader("pi")?.id).toBe("pi");
  });

  it("does NOT map the bare `agent` shim to Cursor — it collides with Grok", () => {
    // `~/.local/bin/agent` is Grok's shim on machines with both installed
    // (confirmed live 2026-07-29). Mapping it to Cursor mis-detected Grok as
    // Cursor and made Cursor's resume command invoke Grok. Cursor is matched
    // only by its unambiguous `cursor-agent` argv0.
    expect(agentByLeader("agent")).toBeUndefined();
    expect(agentByLeader("/Users/x/.local/bin/agent")).toBeUndefined();
  });

  it("matches a known agent by full-path leader", () => {
    expect(agentByLeader("/opt/homebrew/bin/claude")?.id).toBe("claude");
    expect(agentByLeader("/usr/local/bin/cursor-agent")?.id).toBe("cursor");
    expect(agentByLeader("/Users/x/.local/bin/grok")?.id).toBe("grok");
  });

  it("returns undefined for a plain shell / unknown program", () => {
    expect(agentByLeader("zsh")).toBeUndefined();
    expect(agentByLeader("/bin/bash")).toBeUndefined();
    // "cursor" (the editor) is not "cursor-agent" (the CLI).
    expect(agentByLeader("cursor")).toBeUndefined();
  });
});

describe("agentByProcessArgs", () => {
  it("matches pi by argv0 basename", () => {
    expect(agentByProcessArgs("pi -e ./ext.ts")?.id).toBe("pi");
  });

  it("matches a node-wrapped pi launched through its PATH symlink", () => {
    // The real shape, captured live (pi 0.84.2): `pi` on PATH is a symlink
    // into the package and `ps` reports the path as invoked, so the package
    // name appears NOWHERE in argv — only the script basename identifies it.
    expect(
      agentByProcessArgs("node /Users/x/.nvm/versions/node/v24.19.0/bin/pi")
        ?.id,
    ).toBe("pi");
  });

  it("matches through a shell alias that appends flags", () => {
    // e.g. `alias pix='pi -e ~/ext.ts'` — the alias expands before exec, so
    // argv is the same plus arguments.
    expect(
      agentByProcessArgs(
        "node /Users/x/.nvm/versions/node/v24.19.0/bin/pi -e /Users/x/ext.ts",
      )?.id,
    ).toBe("pi");
  });

  it("skips interpreter flags to find the script", () => {
    expect(
      agentByProcessArgs("node --inspect /Users/x/.local/bin/claude")?.id,
    ).toBe("claude");
  });

  it("matches node-wrapped pi by package path when run as the package file", () => {
    expect(
      agentByProcessArgs(
        "node /Users/x/.nvm/versions/node/v24/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
      )?.id,
    ).toBe("pi");
  });

  it("does not match an unrelated node script", () => {
    expect(agentByProcessArgs("node /usr/bin/npm run dev")).toBeUndefined();
    // A path merely *containing* the two-character name is not a match.
    expect(
      agentByProcessArgs("node /Users/x/pipeline/scripts/build.js"),
    ).toBeUndefined();
    expect(agentByProcessArgs("")).toBeUndefined();
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

  it("includes every hook-capable agent (Claude, Codex, Cursor, Copilot, pi)", () => {
    const ids = hookInstallableAgents().map((a) => a.id);
    expect(ids).toContain("claude");
    expect(ids).toContain("codex");
    expect(ids).toContain("cursor");
    expect(ids).toContain("copilot");
    // pi's "hook" is a TypeScript extension file rather than a config entry
    // (ADR 0041), but it is still an installable hook and belongs in the
    // Settings → Agents install list.
    expect(ids).toContain("pi");
  });

  it("excludes Grok — it resolves via its own session file, not a hook", () => {
    expect(hookInstallableAgents().map((a) => a.id)).not.toContain("grok");
    expect(agentById("grok")?.resume.kind).toBe("session-file");
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
    expect(agentById("pi")?.resume).toMatchObject({
      kind: "hook",
      installStrategy: "pi-extension",
      configPath: ".pi/agent/extensions/silo-track-session.ts",
      hookEvent: "session_start",
    });
  });
});

describe("sessionFileAgents", () => {
  it("includes Grok and only session-file resume agents", () => {
    const ids = sessionFileAgents().map((a) => a.id);
    expect(ids).toContain("grok");
    for (const a of sessionFileAgents()) {
      expect(a.resume.kind).toBe("session-file");
    }
    expect(ids).not.toContain("claude");
  });
});

describe("Grok — session-file resume", () => {
  const grok = agentById("grok");
  const resume = grok?.resume.kind === "session-file" ? grok.resume : undefined;

  it("is a session-file resume pointing at Grok's active-session registry", () => {
    expect(resume).toBeDefined();
    expect(resume!.sessionFilePath).toBe(".grok/active_sessions.json");
    expect(resume!.buildResumeCommand("abc-123")).toBe("grok --resume abc-123");
  });

  it("resolves the session id whose entry pid matches the terminal's pgid", () => {
    const file = JSON.stringify([
      { session_id: "sess-A", pid: 58782, cwd: "/a" },
      { session_id: "sess-B", pid: 69739, cwd: "/b" },
    ]);
    expect(resume!.resolveSessionId(file, 58782)).toBe("sess-A");
    expect(resume!.resolveSessionId(file, 69739)).toBe("sess-B");
  });

  it("returns null for a pgid with no active session, and for junk input", () => {
    const file = JSON.stringify([
      { session_id: "sess-A", pid: 111, cwd: "/a" },
    ]);
    expect(resume!.resolveSessionId(file, 999)).toBeNull();
    expect(resume!.resolveSessionId("not json", 111)).toBeNull();
    expect(resume!.resolveSessionId("{}", 111)).toBeNull(); // not an array
    expect(resume!.resolveSessionId("[]", 111)).toBeNull();
    // Entry present but missing/empty session_id → no false positive.
    expect(
      resume!.resolveSessionId(JSON.stringify([{ pid: 111 }]), 111),
    ).toBeNull();
    expect(
      resume!.resolveSessionId(
        JSON.stringify([{ pid: 111, session_id: "" }]),
        111,
      ),
    ).toBeNull();
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
      // `cursor-agent`, not the bare `agent` shim (which is Grok on machines
      // with both installed).
      expect(cursor.resume.buildResumeCommand("x")).toBe(
        "cursor-agent --resume x",
      );
    }
    if (copilot?.resume.kind === "hook") {
      expect(copilot.resume.buildResumeCommand("x")).toBe("copilot --resume=x");
    }
    const pi = agentById("pi");
    if (pi?.resume.kind === "hook") {
      // `--session`, NOT `-r`/`--resume` — the latter only opens pi's
      // interactive picker and would ignore the id entirely.
      expect(pi.resume.buildResumeCommand("x")).toBe("pi --session x");
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

  it("pi carries a note about restarting pi and enabling terminal progress", () => {
    const pi = agentById("pi");
    const note = pi?.resume.kind === "hook" ? pi.resume.postInstallNote : "";
    expect(note).toMatch(/restart/i);
    expect(note).toMatch(/[Tt]erminal progress/);
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

  it("detects Claude's circle spinner as working through the full dispatch", () => {
    // Real titles observed from claude-code 2.1.228, which prefixes the
    // conversation title with ◐/◑ instead of the braille frames above. Asserted
    // at the dispatch level (not just detectClaudeCode) so a Cursor/Codex/
    // Copilot detector earlier in catalog order can't quietly swallow them.
    for (const title of ["◐ Design event bus", "◑ Debug OSC detection"]) {
      expect(detectFromOsc(0, title)).toEqual({
        status: "working",
        source: "agent",
        timer: "schedule",
      });
    }
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
  });

  it("does not let one agent's fallback end another agent's turn", () => {
    // Codex's rule is "any plain title ends the turn". Copilot shelling out
    // sets the title to "Windows PowerShell" (observed live on Windows), which
    // would otherwise read as Codex going idle and end Copilot's turn
    // mid-task. Once a terminal's agent is known, only that agent may speak.
    expect(
      detectIdleAfterWorking(0, "Windows PowerShell", true, "copilot"),
    ).toBeNull();
  });

  it("still applies the fallback for the agent it belongs to", () => {
    expect(detectIdleAfterWorking(0, "my-project", true, "codex")).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
  });

  it("applies any agent's fallback when identity is not yet known", () => {
    // Before a terminal is identified there is nothing to gate on, so the
    // pre-existing behavior must be preserved exactly.
    expect(detectIdleAfterWorking(0, "my-project", true, null)).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
    expect(detectIdleAfterWorking(0, "my-project", true, undefined)).toEqual({
      status: "idle",
      source: "agent",
      timer: "clear",
    });
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
