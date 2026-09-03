import {
  detectCursorAgent,
  detectCursorAgentOutput,
} from "../agent-osc-detectors";
import type { AgentDefinition, HookAgentDeps } from "../agent-catalog";

/**
 * Cursor Agent's catalog entry. Plain data — split out in ADR 0042 phase 7
 * purely for `agent-catalog.ts` navigability, same as every other thin
 * entry; see `catalog/claude.ts` for why it takes `deps` instead of importing
 * the shared hook constants directly.
 */
export function buildCursorAgentDefinition(
  deps: HookAgentDeps,
): AgentDefinition {
  const { marker, buildHookCommand } = deps;
  return {
    id: "cursor",
    displayName: "Cursor Agent",
    // `cursor-agent` is Cursor's binary basename on PATH installs. Deliberately
    // NOT the bare `agent` shim: it collides with Grok, which installs its own
    // `~/.local/bin/agent` → `~/.grok/bin/agent` (confirmed live 2026-07-29). A
    // bare `agent` is therefore ambiguous — mapping it to Cursor would mis-detect
    // a Grok session launched as `agent`, and (worse) produce a Cursor resume
    // command that actually invokes Grok. Cursor is identified only by its
    // unambiguous `cursor-agent` argv0.
    leaderNames: ["cursor-agent"],
    // RFC 0033 phase-3 recon (2026-09-02, macOS, cursor-agent
    // 2026.08.31-4057e58): `cursor-agent "<prompt>"` answered and stayed in
    // the TUI. `-p/--print` is the non-interactive mode.
    promptDelivery: { kind: "argv" },
    // OSC 0 title status (preferred), ported from silo-extensions/agent-monitor.
    // Only emitted when `display.showStatusIndicators` is true in
    // ~/.cursor/cli-config.json — the upstream *default is false* — so the raw
    // output fallback below is what most installs actually rely on.
    activityDetectors: [detectCursorAgent],
    // Ink TUI spinner frames land in the raw PTY stream regardless of the OSC
    // config flag — this is the fallback that works out of the box.
    outputDetector: detectCursorAgentOutput,
    resume: {
      kind: "hook",
      installStrategy: "cursor-hooks-json",
      // Cursor's schema is `{ version, hooks: { sessionStart: [{ command }] } }`
      // — not Claude's nested hooks[] groups. Installed via
      // cursor-hook-installer.ts.
      configPath: ".cursor/hooks.json",
      hookEvent: "sessionStart",
      marker,
      buildCommand: () => buildHookCommand("cursor"),
      // Confirmed live (2026-07-28, cursor-agent 2026.07.23): CLI help lists
      // `--resume [chatId]`; the sessionStart payload's `session_id` is the
      // same UUID as `conversation_id`. Use `cursor-agent` (NOT the bare `agent`
      // shim, which is Grok on machines with both installed — confirmed live
      // 2026-07-29: `agent --resume <cursor-id>` ran Grok and errored "No session
      // found"). `cursor-agent --resume <id>` is unambiguous. sessionStart fires
      // when the first character is typed in the TUI — not at process start, and
      // not after a sent message.
      buildResumeCommand: (sessionId) => `cursor-agent --resume ${sessionId}`,
    },
    docsUrl: "https://getsilo.dev/guide/agent-sessions#cursor-agent",
    contract:
      "Exact resume depends on Cursor CLI's sessionStart hook in " +
      "~/.cursor/hooks.json: (1) schema is `{ version: 1, hooks: { " +
      "sessionStart: [{ command }] } }` (camelCase event, flat command " +
      "entries — NOT Claude's hooks.<Event>[].hooks[] shape); (2) CONFIRMED " +
      "live against cursor-agent 2026.07.23 (2026-07-28): CLI fires " +
      "sessionStart when the first character is typed in the TUI (not at " +
      "process start, not after a sent message) with JSON stdin carrying " +
      "`session_id` (= conversation_id); (3) the hook walks parents from its " +
      "PPID to find the agent process and " +
      "records that process's pgid (raw PPID/getpgid(ppid) miss Cursor workers " +
      "that setpgrp); (4) " +
      "`cursor-agent --resume <id>` resumes by that id — NOT the bare `agent` " +
      "shim, which collides with Grok's own `~/.local/bin/agent` (confirmed " +
      "live 2026-07-29). Activity detection (ported from " +
      "silo-extensions/agent-monitor, " +
      "2026-07-28): preferred signal is an OSC 0 title of the form " +
      "'<name> - <emoji?> <status>' — but only emitted when " +
      "`display.showStatusIndicators` is true in ~/.cursor/cli-config.json " +
      "(default false); the fallback matches known ink-spinner byte sequences " +
      "in the terminal's raw output stream, ending on ~1.5s of silence after " +
      "the last frame. RFC 0033 recon (2026-08-31): CURSOR_CONFIG_DIR is a " +
      "real config-dir override (source: env → $XDG_CONFIG_HOME/cursor → " +
      "~/.cursor) but `auth.json` is read from homedir() independently — a " +
      "second profile pointed at it would share the first profile's account " +
      "while appearing to have its own, so `configDirEnvVar` is deliberately " +
      "left undefined. Revisit if Cursor gains a credential-dir override. " +
      "RFC 0033 phase-3 recon (2026-09-02, cursor-agent 2026.08.31-4057e58): " +
      "`agent [options] [command] [prompt...]` takes an opening prompt " +
      "POSITIONALLY and stays interactive — run in a real PTY it answered and " +
      "left the 'Add a follow-up' composer up, so `promptDelivery` is " +
      "{ kind: 'argv' }. `-p/--print` is the non-interactive mode, a NO for " +
      "this field. NOTE the hook/activity findings above were confirmed at " +
      "2026.07.23-e383d2b and were not re-run.",
    upstreamRefs: [
      "https://docs.cursor.com/en/cli/reference/hooks",
      "https://docs.cursor.com/en/cli/overview",
      "https://cursor.com/docs/hooks",
    ],
    lastVerified: "2026-09-02",
    verifiedAgainstVersion: "cursor-agent@2026.08.31-4057e58",
  };
}
