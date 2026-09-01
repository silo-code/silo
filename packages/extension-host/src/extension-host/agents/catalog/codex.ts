import {
  detectClaudeCode,
  detectCodexCLI,
  detectCodexIdleAfterWorking,
} from "../agent-osc-detectors";
import type { AgentDefinition, HookAgentDeps } from "../agent-catalog";

/**
 * Codex CLI's catalog entry. Plain data — split out in ADR 0042 phase 7
 * purely for `agent-catalog.ts` navigability, same as every other thin
 * entry; see `catalog/claude.ts` for why it takes `deps` instead of importing
 * the shared hook constants directly.
 */
export function buildCodexAgentDefinition(
  deps: HookAgentDeps,
): AgentDefinition {
  const { marker, buildHookCommand } = deps;
  return {
    id: "codex",
    displayName: "Codex CLI",
    leaderNames: ["codex"],
    // RFC 0033 recon (2026-08-31, macOS): CODEX_HOME moves both config and
    // credentials (`auth.json`) — `codex doctor` resolves its config and state
    // root from it. The hook `configPath` (`.codex/hooks.json`) sits inside it.
    // Operational note: `codex` does NOT create CODEX_HOME if missing — it
    // warns and fails to load config — so the profile editor stats the dir and
    // offers to create it.
    configDirEnvVar: "CODEX_HOME",
    // "Working" is the shared spinner detector in `detectClaudeCode` (Codex uses
    // the braille range Claude used to); detectCodexCLI covers its own explicit
    // "idle" signals (empty title, action-required markers, OSC 9 notifications).
    // Neither covers the common case — a normal turn finishing with no
    // approval needed, where Codex just sets a plain project/dir title — so
    // idleAfterWorking below handles that contextually.
    activityDetectors: [detectClaudeCode, detectCodexCLI],
    idleAfterWorking: detectCodexIdleAfterWorking,
    resume: {
      kind: "hook",
      installStrategy: "claude-settings",
      // Same shape as Claude's settings.json (hooks.SessionStart[].hooks[]), and
      // the same `session_id` payload field — so it reuses the installer and
      // hook command verbatim, only the agent tag and resume command differ.
      configPath: ".codex/hooks.json",
      hookEvent: "SessionStart",
      marker,
      buildCommand: () => buildHookCommand("codex"),
      buildResumeCommand: (sessionId) => `codex resume ${sessionId}`,
      // Codex's schema documents statusMessage as "a display string shown
      // during hook execution" — an extra attribution surface on top of the
      // command's own leading identifier, for whatever review/execution UI
      // Codex shows it in.
      statusMessage: "Silo session tracking (getsilo.dev)",
      // CONFIRMED live (2026-07-27, codex-cli 0.144.5): Codex requires every
      // individual hook entry to be reviewed and trusted (per-hook-index
      // trusted_hash recorded in ~/.codex/config.toml's [hooks.state]) before
      // it will run — installing the config entry alone is silently inert. It
      // does not prompt automatically; the user must open `/hooks` inside a
      // running Codex session and approve Silo's entry once.
      postInstallNote:
        "After enabling, open Codex and run /hooks once to review and trust " +
        "Silo's entry — Codex requires each hook to be individually approved " +
        "and won't run a newly installed one automatically.",
    },
    docsUrl: "https://getsilo.dev/guide/agent-sessions#codex-cli",
    contract:
      "Codex CLI's SessionStart hook is configured in ~/.codex/hooks.json using " +
      "the same shape as Claude (hooks.SessionStart[].hooks[] with " +
      "{ type: 'command', command }), and its payload carries `session_id` and " +
      "`cwd` — so it reuses Silo's Claude installer and hook command verbatim. " +
      "CONFIRMED live against codex-cli 0.144.5 (2026-07-27): (1) no " +
      "`codex_hooks` feature flag is needed — a pre-existing third-party hook " +
      "ran fine on this install with no such flag in config.toml; (2) `codex " +
      "resume <SESSION_ID>` (positional UUID) is the exact interactive resume " +
      "syntax, per `codex resume --help`; (3) **critically**, an installed hook " +
      "entry does not run until individually trusted — Codex records a " +
      "trusted_hash per hook index in config.toml's [hooks.state], a freshly " +
      "appended entry has none, and Codex skips it silently rather than " +
      "prompting; the user must run `/hooks` inside Codex once to approve it " +
      "(see resume.postInstallNote). STILL UNVERIFIED: whether a matcher-less " +
      "group (Silo installs without one) fires on both startup and resume once " +
      "trusted — blocked on completing the trust step to test. Activity " +
      "detection (ported from silo-extensions/agent-monitor, 2026-07-28): " +
      "'working' shares Claude's spinner OSC 0 detector, on its braille branch " +
      "(U+2800–28FF — the range Claude itself used until claude-code 2.1.228); " +
      "'idle' comes from either an empty " +
      "OSC 0 title, '[ ! ]'/'[ . ]' (awaiting approval), specific OSC 9 iTerm " +
      "notifications, OR — the common case, a normal turn finishing with no " +
      "approval needed — a contextual fallback: any other non-empty OSC 0 " +
      "title while an agent-sourced working phase is active is inferred idle, " +
      "since Codex has no other explicit 'idle' signal for that case.",
    upstreamRefs: [
      "https://developers.openai.com/codex/hooks",
      "https://developers.openai.com/codex/config-advanced",
      "https://github.com/openai/codex",
    ],
    lastVerified: "2026-08-31",
    verifiedAgainstVersion: "codex-cli@0.144.5",
  };
}
