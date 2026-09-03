import {
  detectClaudeCode,
  detectCodexIdleAfterWorking,
} from "../agent-osc-detectors";
import type { AgentDefinition } from "../agent-catalog";

/**
 * Grok's catalog entry. Plain data, and needs none of `agent-catalog.ts`'s
 * shared hook constants (its resume is `session-file`, not `hook`) — so
 * unlike `claude.ts`/`codex.ts`/`cursor.ts`/`copilot.ts` this is a plain
 * exported object, not a deps-taking factory. Split out in ADR 0042 phase 7
 * purely for `agent-catalog.ts` navigability.
 */
export const grokAgent: AgentDefinition = {
  id: "grok",
  displayName: "Grok",
  leaderNames: ["grok"],
  // RFC 0033 recon (2026-08-31): GROK_HOME overrides the base directory (per
  // the binary's own `--help`: "Set GROK_HOME to override the base directory")
  // and carries credentials (`auth.json`) with it. Resume is session-file, not
  // hook, so no hook config path is involved.
  configDirEnvVar: "GROK_HOME",
  // RFC 0033 phase-3 recon (2026-09-02, macOS, grok 1.0.13): `grok "<prompt>"`
  // answered and stayed in the TUI — its own `--help` calls the positional
  // "Initial prompt for the interactive session".
  promptDelivery: { kind: "argv" },
  // "Working" shares the spinner OSC 0 detector, on its braille branch — Grok's
  // TUI uses the U+2800–28FF glyph range Claude used until 2.1.228 (confirmed
  // live: Grok shows as an agent via this shared detector before any
  // Grok-specific entry existed). Idle is the shared contextual fallback (an
  // OSC 0 title with no spinner glyph after an agent-sourced working phase),
  // reused from Codex — provisional until a Grok-specific idle signal is
  // observed.
  activityDetectors: [detectClaudeCode],
  idleAfterWorking: detectCodexIdleAfterWorking,
  resume: {
    // Grok maintains its own live session registry, so exact resume needs no
    // hook: Silo reads Grok's file when it detects the Grok foreground and
    // matches the terminal's foreground pgid against the recorded pid.
    kind: "session-file",
    sessionFilePath: ".grok/active_sessions.json",
    resolveSessionId: (fileText, pgid) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(fileText);
      } catch {
        return null;
      }
      if (!Array.isArray(parsed)) return null;
      for (const e of parsed) {
        if (
          e &&
          typeof e === "object" &&
          (e as { pid?: unknown }).pid === pgid &&
          typeof (e as { session_id?: unknown }).session_id === "string" &&
          (e as { session_id: string }).session_id
        ) {
          return (e as { session_id: string }).session_id;
        }
      }
      return null;
    },
    buildResumeCommand: (sessionId) => `grok --resume ${sessionId}`,
  },
  docsUrl: "https://getsilo.dev/guide/agent-sessions#grok",
  contract:
    "Exact resume uses Grok's OWN live session registry — no hook, no install, " +
    "no trust step. CONFIRMED live against grok 0.2.114 (2026-07-29): " +
    "(1) Grok maintains ~/.grok/active_sessions.json, a JSON array of " +
    "{ session_id, pid, cwd, opened_at } for currently-active sessions; " +
    "(2) Grok runs as a process-group leader (pgid == pid), so a terminal's " +
    "foreground pgid equals the `pid` recorded in the file — Silo reads the " +
    "file when it first detects a Grok foreground (and again whenever " +
    "`active_sessions.json` changes — Grok only creates a session on the " +
    "first typed character, not at process start) and matches pgid " +
    "→ pid to attach the exact session id; (3) `grok --resume <SESSION_ID>` " +
    "resumes by id (UUID-shaped values are always treated as ids, per " +
    "`grok --resume --help`); session ids are UUIDv7. Activity: 'working' " +
    "shares the spinner OSC 0 detector on its braille branch (U+2800–28FF — " +
    "the range Claude itself used until claude-code 2.1.228, confirmed " +
    "shared); idle is the shared contextual fallback (an OSC 0 title with no " +
    "spinner glyph after an agent-sourced working phase) — " +
    "PROVISIONAL, pending observation of a Grok-specific idle signal. Note: " +
    "Grok ALSO supports [[hooks.SessionStart]] hooks, but only in TOML " +
    "config.toml (no global JSON hooks dir) and behind a folder-trust step, so " +
    "the native session file is the cleaner integration. Caveat: Grok imports " +
    "hooks from ~/.claude/settings.json for Claude compatibility — Silo's " +
    "Claude SessionStart hook can fire against a Grok pid; the host rejects " +
    "that mismatch via the sticky foreground agent id and lets the session " +
    "file win. RFC 0033 phase-3 recon (2026-09-02, grok 1.0.13): the " +
    "positional `[PROMPT]` is documented as the 'Initial prompt for the " +
    "interactive session' and behaves that way — run in a real PTY, " +
    '`grok "<prompt>"` answered and left the composer up, so ' +
    "`promptDelivery` is { kind: 'argv' }. NOTE the resume/activity findings " +
    "above were confirmed at 0.2.114 and were not re-run at 1.0.13.",
  upstreamRefs: ["https://github.com/xai-org/grok-cli", "https://docs.x.ai"],
  lastVerified: "2026-09-02",
  verifiedAgainstVersion: "grok@1.0.13",
};
