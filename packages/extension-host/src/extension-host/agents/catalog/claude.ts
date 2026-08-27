import { detectClaudeCode } from "../agent-osc-detectors";
import type { AgentDefinition, HookAgentDeps } from "../agent-catalog";

/**
 * Claude Code's catalog entry. Plain data — no runtime quirks (ADR 0042
 * decision 2 would keep this inline in `agent-catalog.ts` on quirk grounds
 * alone), but split into its own module in phase 7 alongside every other
 * thin entry purely so `agent-catalog.ts` stays navigable as the catalog
 * grows. Takes `deps` rather than importing `SILO_HOOK_MARKER`/
 * `buildHookCommand` directly, the same shape `catalog/pi.ts` established, so
 * `agent-catalog.ts` stays the SSOT for those constants with no runtime
 * import cycle back into it.
 */
export function buildClaudeAgentDefinition(
  deps: HookAgentDeps,
): AgentDefinition {
  const { marker, buildHookCommand } = deps;
  return {
    id: "claude",
    displayName: "Claude Code",
    leaderNames: ["claude"],
    activityDetectors: [detectClaudeCode],
    resume: {
      kind: "hook",
      installStrategy: "claude-settings",
      configPath: ".claude/settings.json",
      hookEvent: "SessionStart",
      marker,
      buildCommand: () => buildHookCommand("claude"),
      buildResumeCommand: (sessionId) => `claude --resume ${sessionId}`,
    },
    docsUrl: "https://getsilo.dev/guide/agent-sessions#claude-code",
    contract:
      "Exact resume depends on Claude Code's SessionStart hook: (1) hooks are " +
      "configured in ~/.claude/settings.json under hooks.SessionStart[].hooks[] " +
      "as { type: 'command', command }; (2) the hook receives a JSON stdin " +
      "payload carrying a session id (field `session_id`, or `sessionId`) and " +
      "`cwd`; (3) the hook walks parents from its PPID to find the agent " +
      "process and records that process's pgid (used to correlate against the " +
      "terminal's foreground pgid — raw PPID alone misses Cursor workers that " +
      "setpgrp). Activity detection " +
      "depends on Claude prefixing its OSC 0 title with an animated spinner " +
      "glyph while working and a '✳' marker when awaiting input. CONFIRMED " +
      "against claude-code 2.1.228 (2026-08-11): the spinner glyphs are now the " +
      "half-filled circles ◐/◑ (U+25D0–U+25D3 accepted) — they were braille " +
      "(U+2800–28FF) in earlier builds, and Silo accepts BOTH ranges so old " +
      "installs (and Codex/Grok, which still use braille) keep working. The " +
      "title itself is '<glyph> <conversation title>'; the '✳' idle marker is " +
      "unchanged. A future glyph change here silently breaks 'working' only — " +
      "idle detection would keep working, so the symptom is an agent terminal " +
      "that never lights up as busy.",
    upstreamRefs: [
      "https://docs.claude.com/en/docs/claude-code/hooks",
      "https://docs.claude.com/en/docs/claude-code/settings",
    ],
    lastVerified: "2026-08-11",
    verifiedAgainstVersion: "claude-code@2.1.228",
  };
}
