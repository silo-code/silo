import {
  detectClaudeCode,
  detectCodexCLI,
  detectCodexIdleAfterWorking,
  detectCopilotCLI,
  detectPiTitle,
  detectCursorAgent,
  detectCursorAgentOutput,
  detectShellIntegration,
  type DetectionResult,
} from "./agent-osc-detectors";
import { renderTrackSessionScript } from "./agent-hook-script";
import { renderPiTrackSessionExtension } from "./agent-pi-extension";

/**
 * The single source of truth for every coding agent Silo supports (RFC 0018).
 *
 * Before this catalog, per-agent knowledge was scattered across ~6 files
 * (leader names, activity detectors, the hook command, the settings-page
 * install list, display names). Adding an agent meant touching all of them,
 * and nothing forced you to touch all of them. Now each agent is **one
 * entry**, and every subsystem derives its view from `AGENT_CATALOG`:
 *
 * - detection dispatch → `detectFromOsc` (OSC-based), `detectFromOutput`
 *   (raw-PTY fallback, e.g. Cursor's spinner), `detectIdleAfterWorking`
 *   (contextual fallback, e.g. Codex's plain-title idle)
 * - resume-hint gating → `agentByLeader` / `isKnownAgentLeader`
 * - hook install UI (Settings → Agents) → `hookInstallableAgents`
 * - hook-event display names → `agentById`
 *
 * Host-internal by design — detection and resume are sealed (no public
 * `registerAgent`; see RFC 0018 "Detection is sealed, not pluggable"). The
 * `core.agents-settings` extension reads the catalog through the privileged
 * `@silo-code/extension-host/internal` barrel.
 *
 * ## Keeping entries honest
 *
 * Each entry carries `contract` (a prose statement of exactly what upstream
 * behavior we depend on), `upstreamRefs` (the agent's own docs we track),
 * `lastVerified`, and `verifiedAgainstVersion`. Those are the rubric **and**
 * checkpoint for the periodic agent-support audit skill: it compares the
 * agent's current published version against `verifiedAgainstVersion`, and
 * when they differ, judges the upstream change against `contract` (rather
 * than dumbly diffing docs) before flagging anything. See RFC 0018
 * "Tracking upstream agent changes".
 */

/** A pure OSC activity detector — first non-null result wins during
 * dispatch. Same shape the detectors in `agent-osc-detectors.ts` already had. */
export type OscDetector = (
  code: number,
  payload: string,
) => DetectionResult | null;

/** A pure raw-PTY-output activity detector — for an agent whose status
 * isn't reliably exposed via OSC at all (Cursor Agent's spinner frames land
 * in the raw output stream, not a title). */
export type OutputDetector = (chunk: string) => DetectionResult | null;

/**
 * A *contextual* OSC fallback: unlike {@link OscDetector}, it also needs to
 * know whether the terminal was already in an agent-sourced working state,
 * because its signal isn't a fixed pattern — it's "this OSC 0 title isn't any
 * known non-idle pattern, and we were just working, so infer idle" (Codex's
 * plain-title-after-a-turn case). Tried only after every catalog agent's
 * ordinary `activityDetectors` come back empty (see `agents-service.ts`'s
 * OSC callback), so it can't accidentally promote an unrelated program that
 * merely sets a window title.
 */
export type IdleAfterWorkingDetector = (
  code: number,
  payload: string,
  wasAgentWorking: boolean,
) => DetectionResult | null;

/** Marker embedded in every hook command Silo installs, so uninstall and
 * install-state detection can find (only) Silo's own entries without
 * disturbing hooks a user configured through another tool. */
export const SILO_HOOK_MARKER = "silo-managed-agent-hook";

/** Directory, relative to `$HOME`, where Silo's session hook writes its event
 * log and where the shared capture script lives. App-identity-agnostic (not
 * under `~/.config/silo[-dev]`) so every Silo build/identity reads the same
 * place — see `agent-hook-events.ts`. */
export const AGENT_HOOKS_DIR_REL = ".silo/agent-hooks";

/** The shared POSIX-shell session-capture script, relative to `$HOME`. Written
 * once by the Settings → Agents installer (RFC 0019); every agent's hook
 * command invokes it as `sh "$HOME/<this>" <agentId>`. */
export const TRACK_SCRIPT_REL = `${AGENT_HOOKS_DIR_REL}/track-session.sh`;

/**
 * How Settings → Agents writes this agent's hook into its config. Each
 * strategy has its own pure installer (Claude/Codex share
 * `hook-installer.ts`; Cursor, Copilot, and pi each have a dedicated module)
 * because the on-disk schemas differ. `pi-extension` is the odd one out: pi
 * has no shell-command hook config at all, so the "config" Silo writes is a
 * small TypeScript extension file (ADR 0041).
 */
export type HookInstallStrategy =
  | "claude-settings"
  | "cursor-hooks-json"
  | "copilot-hooks-dir"
  | "pi-extension";

/**
 * Exact-resume capability for an agent: either it exposes a session-start
 * hook Silo can install (`kind: "hook"`), or it doesn't and the terminal
 * only ever gets the honest generic hint (`kind: "none"`). A discriminated
 * union so "this agent has no exact-resume path" is a first-class, encoded
 * state — not a gap someone forgot to fill.
 */
export interface AgentHookResume {
  kind: "hook";
  /** Which on-disk schema / installer Settings should use for this agent. */
  installStrategy: HookInstallStrategy;
  /** Path to the agent's hook config file, relative to `$HOME` (POSIX
   * slashes). For `copilot-hooks-dir` this is Silo's dedicated file under
   * `~/.copilot/hooks/` (created/removed wholesale); for the others it is
   * the shared settings/hooks file that is merge-edited. */
  configPath: string;
  /** Lifecycle event the hook attaches to, e.g. `"SessionStart"` (Claude/
   * Codex) or `"sessionStart"` (Cursor / Copilot camelCase). */
  hookEvent: string;
  /** Marker embedded in the built command (always {@link SILO_HOOK_MARKER}). */
  marker: string;
  /** Builds the single-line shell command the hook runs. Must embed
   * `marker` and write one JSON line to `~/.silo/agent-hooks/events.jsonl`
   * (see `agent-hook-events.ts`). */
  buildCommand: () => string;
  /**
   * For a strategy whose "config" is a Silo-owned file written wholesale
   * rather than a merge into someone else's schema, the file's full
   * contents. Only `pi-extension` needs it (its hook is a TypeScript
   * extension, not a command in a config file — ADR 0041). It lives on the
   * descriptor, rather than the installer importing the catalog, so the
   * installers stay pure modules parameterized by a structural spec — the
   * same reason `buildCommand` lives here.
   */
  buildFileContents?: () => string;
  /** Builds the exact resume command for a captured session id, e.g.
   * `claude --resume <id>` / `codex resume <id>` / `agent --resume <id>` /
   * `copilot --resume=<id>`. Per-agent because the syntax differs; this is
   * what `applyHookMatch` surfaces as the terminal's `resumeCommand` once
   * the hook reports an exact id. */
  buildResumeCommand: (sessionId: string) => string;
  /** Optional human-readable label written onto the installed entry (passed
   * through to `HookInstallSpec.statusMessage`) for agents whose schema
   * supports one (Codex's `statusMessage` field) — an extra attribution
   * layer for a human reviewing the hook, on top of the command's own
   * self-identifying `.silo/…/track-session.sh` path (see
   * {@link buildHookCommand}). Undefined for agents whose schema doesn't have
   * an equivalent field (Claude Code). */
  statusMessage?: string;
  /**
   * Extra manual step required *after* toggling install on, shown in the
   * Settings → Agents UI, if this agent needs one beyond "write the config
   * file" — e.g. Codex requires each hook entry to be individually trusted
   * (`/hooks` inside a session) before it will actually run one; installing
   * the file entry alone is silently inert without it (confirmed: Codex's
   * `config.toml` records a per-hook-index `trusted_hash`, and a newly
   * appended entry has none until reviewed). Undefined when the config write
   * alone is sufficient (e.g. Claude Code — hooks fire with no separate
   * trust step).
   */
  postInstallNote?: string;
}

/**
 * Exact-resume via the agent's **own** live session registry — no hook, no
 * install, no trust step. For agents (Grok) that already maintain a native
 * `{ pid → session_id }` file of currently-active sessions. Silo reads that
 * file when it detects this agent's foreground (and again whenever the
 * registry file changes — important for agents like Grok that only create a
 * session on the first typed character, not at process start) and matches the
 * terminal's sticky agent pgid against it — the agent runs as a
 * process-group leader, so its pgid equals the pid recorded in the file. This
 * reuses the exact pgid-correlation model the hook path uses, minus the hook.
 */
export interface AgentSessionFileResume {
  kind: "session-file";
  /** Path to the agent's live active-session registry, relative to `$HOME`
   * (POSIX slashes), e.g. `.grok/active_sessions.json`. */
  sessionFilePath: string;
  /** Parse the file's text and return the session id whose entry's pid matches
   * `pgid`, or `null` if not present yet (the session may not have been
   * written when the foreground was first detected — e.g. Grok waits for the
   * first typed character; the host retries briefly and watches the file). Kept
   * per-agent because each agent's file shape differs. */
  resolveSessionId: (fileText: string, pgid: number) => string | null;
  /** Builds the exact resume command for a captured id, e.g.
   * `grok --resume <id>`. Surfaced as the terminal's `resumeCommand`. */
  buildResumeCommand: (sessionId: string) => string;
}

export interface AgentNoResume {
  kind: "none";
}

export type AgentResume =
  | AgentHookResume
  | AgentSessionFileResume
  | AgentNoResume;

export interface AgentDefinition {
  /** Stable id, also written into hook events as the `agent` tag. */
  id: string;
  /** Human-readable name, e.g. `"Claude Code"`. */
  displayName: string;
  /** Foreground-process basenames that identify this agent (matched against
   * `leaderBasename(leader)`). Usually one, but an agent may ship under
   * several binary names. */
  leaderNames: string[];
  /** Per-agent activity/OSC detectors, tried in order. Empty if Silo can't
   * yet read this agent's activity (it still appears via `ctx.processes`
   * leader/cwd facts, just with no `working`/`idle` state). */
  activityDetectors: OscDetector[];
  /** Raw-output fallback for status that isn't reliably exposed via OSC
   * (Cursor Agent's spinner, when `showStatusIndicators` is off — the
   * upstream default). Undefined for agents that don't need one. */
  outputDetector?: OutputDetector;
  /** Contextual OSC fallback for an agent whose "turn finished" signal isn't
   * a fixed pattern (Codex). Undefined for agents that don't need one. */
  idleAfterWorking?: IdleAfterWorkingDetector;
  /** How (or whether) an exact resume identity can be captured. */
  resume: AgentResume;
  /** "Setup details" link shown next to the install toggle. */
  docsUrl: string;

  // ── provenance / maintenance (audit-skill rubric + checkpoint) ──────────
  /** Plain-language statement of exactly what upstream behavior our
   * integration depends on. This is what the audit skill judges an upstream
   * change *against* — the alternative to dumbly diffing docs. */
  contract: string;
  /** The agent's own docs we track for changes to that contract. */
  upstreamRefs: string[];
  /** ISO date this entry was last confirmed accurate. */
  lastVerified: string;
  /** Agent version this entry was last confirmed against; the audit skill's
   * checkpoint. Undefined = never version-verified (first audit fills it). */
  verifiedAgainstVersion?: string;
}

/**
 * The list of known-agent binary names the capture script matches against
 * while walking up the process tree — the union of every catalog entry's
 * `leaderNames`, deduped. Templated into the script at write time (RFC 0019)
 * so the catalog stays the single source of truth: adding an agent updates the
 * script the next time it's written, with no second hand-maintained list.
 */
function knownAgentNames(): string {
  return [...new Set(AGENT_CATALOG.flatMap((a) => a.leaderNames))].join(" ");
}

/**
 * Build the shared POSIX-shell session-capture script (RFC 0019). Catalog
 * supplies known names + marker; the shell body lives in
 * {@link renderTrackSessionScript}.
 */
export function buildTrackSessionScript(): string {
  return renderTrackSessionScript({
    marker: SILO_HOOK_MARKER,
    hooksDirRel: AGENT_HOOKS_DIR_REL,
    knownNames: knownAgentNames(),
  });
}

/**
 * Build the source of Silo's pi extension (ADR 0041) — pi's equivalent of the
 * one-line hook command every other agent gets. Catalog supplies the marker,
 * the script path, and the agent tag; the TypeScript body lives in
 * {@link renderPiTrackSessionExtension}.
 */
export function buildPiExtensionSource(): string {
  return renderPiTrackSessionExtension({
    marker: SILO_HOOK_MARKER,
    trackScriptRel: TRACK_SCRIPT_REL,
    agentId: "pi",
  });
}

/**
 * The single-line command Silo installs into an agent's hook config: a plain
 * invocation of the shared {@link buildTrackSessionScript} script, tagged with
 * this agent's id and carrying {@link SILO_HOOK_MARKER} as a trailing comment
 * (what `isSiloEntry` keys off for install-state detection / uninstall /
 * drift-refresh). `$HOME`-relative so it bakes in no machine-specific path and
 * survives config-syncing across machines; every agent runs hooks via `sh -c`,
 * so `$HOME` expands.
 */
function buildHookCommand(agentId: string): string {
  return `sh "$HOME/${TRACK_SCRIPT_REL}" ${agentId} # ${SILO_HOOK_MARKER}`;
}

const claude: AgentDefinition = {
  id: "claude",
  displayName: "Claude Code",
  leaderNames: ["claude"],
  activityDetectors: [detectClaudeCode],
  resume: {
    kind: "hook",
    installStrategy: "claude-settings",
    configPath: ".claude/settings.json",
    hookEvent: "SessionStart",
    marker: SILO_HOOK_MARKER,
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

const codex: AgentDefinition = {
  id: "codex",
  displayName: "Codex CLI",
  leaderNames: ["codex"],
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
    marker: SILO_HOOK_MARKER,
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
  lastVerified: "2026-07-27",
  verifiedAgainstVersion: "codex-cli@0.144.5",
};

const cursor: AgentDefinition = {
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
    marker: SILO_HOOK_MARKER,
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
    "the last frame.",
  upstreamRefs: [
    "https://docs.cursor.com/en/cli/reference/hooks",
    "https://docs.cursor.com/en/cli/overview",
    "https://cursor.com/docs/hooks",
  ],
  lastVerified: "2026-07-28",
  verifiedAgainstVersion: "cursor-agent@2026.07.23-e383d2b",
};

const copilot: AgentDefinition = {
  id: "copilot",
  displayName: "GitHub Copilot CLI",
  leaderNames: ["copilot"],
  // OSC 9;4 (ConEmu/Windows Terminal progress protocol), ported from
  // silo-extensions/agent-monitor.
  activityDetectors: [detectCopilotCLI],
  resume: {
    kind: "hook",
    installStrategy: "copilot-hooks-dir",
    // Dedicated file under ~/.copilot/hooks/ — Copilot loads every *.json
    // there, so create/delete is safer than merging settings.json.
    configPath: ".copilot/hooks/silo-managed-agent-hook.json",
    hookEvent: "sessionStart",
    marker: SILO_HOOK_MARKER,
    buildCommand: () => buildHookCommand("copilot"),
    // Confirmed live (2026-07-28): `copilot --resume=<id>` (and
    // `--resume=<prefix>`); sessionStart payload carries camelCase
    // `sessionId`.
    buildResumeCommand: (sessionId) => `copilot --resume=${sessionId}`,
  },
  docsUrl: "https://getsilo.dev/guide/agent-sessions#github-copilot-cli",
  contract:
    "Exact resume depends on Copilot CLI's sessionStart hook: (1) user-level " +
    "hooks live as *.json files under ~/.copilot/hooks/ with shape " +
    "`{ version: 1, hooks: { sessionStart: [{ type: 'command', command }] } }` " +
    "(also loadable inline in ~/.copilot/settings.json — Silo uses a " +
    "dedicated file so uninstall is delete-only); (2) CONFIRMED live " +
    "(2026-07-28): sessionStart fires with camelCase `sessionId` + `cwd` on " +
    "stdin, including for `copilot -p`; (3) the hook walks parents from its " +
    "PPID to find the agent process and records that process's pgid; (4) " +
    "`copilot --resume=<id>` resumes by that id. Activity comes from " +
    "OSC 9;4 progress notifications — payload '4;<state>' — with state " +
    "1/2/3 = working and state 0/4 = idle.",
  upstreamRefs: [
    "https://docs.github.com/en/copilot/reference/hooks-configuration",
    "https://github.com/github/copilot-cli",
    "https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/overview",
  ],
  lastVerified: "2026-07-28",
};

const grok: AgentDefinition = {
  id: "grok",
  displayName: "Grok",
  leaderNames: ["grok"],
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
    "file win.",
  upstreamRefs: ["https://github.com/xai-org/grok-cli", "https://docs.x.ai"],
  lastVerified: "2026-07-29",
  verifiedAgainstVersion: "grok@0.2.114",
};

const pi: AgentDefinition = {
  id: "pi",
  // Lowercase on purpose: upstream brands it "pi" (pi.dev), and the repo
  // already labels a pi-kind terminal "pi agent".
  displayName: "pi",
  // `pi` on PATH is a symlink to the package's `dist/cli.js`, which carries a
  // `#!/usr/bin/env node` shebang — so the foreground process reports as
  // node-wrapped, exactly like Claude and Copilot.
  leaderNames: ["pi"],
  // Pi emits the same OSC 9;4 progress protocol Copilot does (`4;3` on turn
  // start, `4;0` on turn end), so it shares that detector rather than getting
  // a near-identical copy. Its OSC 0 title ("π - <session> - <cwd>") encodes
  // no status, and its TUI spinner is the *generic* braille frame set, which
  // is far too common in raw output to match safely — the progress protocol
  // is the only trustworthy signal it has.
  activityDetectors: [detectPiTitle, detectCopilotCLI],
  resume: {
    kind: "hook",
    installStrategy: "pi-extension",
    // Not a config file: pi has no shell-command hook mechanism, so this is a
    // Silo-owned TypeScript extension that pi auto-loads from its global
    // extensions directory. Created wholesale on install, deleted on
    // uninstall (like Copilot's dedicated file, never a merge target).
    configPath: ".pi/agent/extensions/silo-track-session.ts",
    hookEvent: "session_start",
    marker: SILO_HOOK_MARKER,
    // What the extension spawns — the same shared capture script every other
    // agent runs. The pi installer templates it as an argv inside
    // `buildPiExtensionSource()` rather than as a shell string, but the
    // command being run is exactly this.
    buildCommand: () => buildHookCommand("pi"),
    buildFileContents: buildPiExtensionSource,
    // Confirmed live (2026-08-22, pi 0.84.2): `pi --session <id>` accepts a
    // full or partial session UUID, resolving the current project's sessions
    // first and then globally. It is also how pi itself relaunches a session
    // internally. `-r`/`--resume` exists but only opens the interactive
    // picker, so it is NOT the exact-resume syntax.
    buildResumeCommand: (sessionId) => `pi --session ${sessionId}`,
    postInstallNote:
      "Pi loads extensions at startup, so restart any pi session you already " +
      "have open. Use “Terminal progress” below for live working/idle status " +
      "in Silo.",
  },
  docsUrl: "https://getsilo.dev/guide/agent-sessions#pi",
  contract:
    "Pi is the one supported agent with no shell-command hook mechanism: its " +
    "hooks are TypeScript extensions auto-loaded from ~/.pi/agent/extensions/" +
    "*.ts (global, no trust step — only project-local .pi/extensions requires " +
    "project trust). CONFIRMED live against pi 0.84.2 (2026-08-22): (1) an " +
    "extension is a module with a default factory `(pi: ExtensionAPI) => void` " +
    'that subscribes via `pi.on("session_start", handler)`; the event fires ' +
    "with reason startup/reload/new/resume/fork and the handler's ctx exposes " +
    "`sessionManager.getSessionId()` (a UUID) and `cwd`; (2) node built-ins " +
    "(node:child_process, node:os, node:path) are available to extensions, and " +
    "TypeScript is loaded through jiti with no build step, so the type-only " +
    "import in Silo's extension is erased at runtime; (3) `pi --session <id>` " +
    "resumes by full or partial session UUID (project-scoped first, then " +
    "global) — `-r` only opens the picker; (4) sessions are stored as " +
    "~/.pi/agent/sessions/<slugified-cwd>/<timestamp>_<uuid>.jsonl and pi keeps " +
    "NO live pid registry, which is why the session-file resume path (Grok's) " +
    "does not apply here. Because the extension runs inside pi's own process, " +
    "it passes pi's pid to the capture script via SILO_AGENT_PID and the " +
    "script skips its parent walk — the walk would be actively wrong for a " +
    "two-character agent name matched by substring. Activity detection: pi " +
    "emits OSC 9;4;3 at turn start and OSC 9;4;0 at turn end (the ConEmu " +
    "progress protocol, via its TUI's setProgress), which is the same signal " +
    "Copilot uses, BUT only when `terminal.showTerminalProgress` is true in " +
    "~/.pi/agent/settings.json and that DEFAULTS TO FALSE (same situation as " +
    "Cursor's showStatusIndicators). With it off, a pi terminal is still " +
    "identified as an agent and still gets exact resume; it just never lights " +
    "up as busy. Pi also emits OSC 133 A/B/C zones around messages, which the " +
    'generic shell-integration fallback reads as `source: "shell"` — useful ' +
    "noise, not agent identity.",
  upstreamRefs: [
    "https://pi.dev",
    "https://www.npmjs.com/package/@earendil-works/pi-coding-agent",
    // The package ships its own docs — docs/extensions.md (the extension API
    // and session_start payload) and docs/sessions.md (--session semantics)
    // are the two Silo's contract depends on.
  ],
  lastVerified: "2026-08-22",
  verifiedAgainstVersion: "pi@0.84.2",
};

/** Every agent Silo knows about. Order is the detection-dispatch order. */
export const AGENT_CATALOG: AgentDefinition[] = [
  claude,
  codex,
  cursor,
  copilot,
  grok,
  pi,
];

// ---- derived views ----------------------------------------------------------

/** `leader` is observed to be a full path on some installs (e.g. a
 * Bun-compiled `claude` reporting as `/Users/x/.local/bin/claude`, not bare
 * `claude`) — match on the basename, not the whole string. */
export function leaderBasename(leader: string): string {
  const idx = leader.lastIndexOf("/");
  return idx >= 0 ? leader.slice(idx + 1) : leader;
}

/** The catalog entry whose `leaderNames` includes this foreground leader's
 * basename, or undefined for a plain shell / unrecognized program. */
export function agentByLeader(leader: string): AgentDefinition | undefined {
  const base = leaderBasename(leader);
  return AGENT_CATALOG.find((a) => a.leaderNames.includes(base));
}

/** Interpreters that run an agent CLI as a *script argument*, so argv0 names
 * the runtime rather than the agent. Node covers pi/Claude/Copilot-style
 * installs; bun and deno are here because the same shape applies to them. */
const SCRIPT_INTERPRETERS = new Set(["node", "bun", "deno"]);

/**
 * Resolve an agent from a process's full argv when argv0 alone is ambiguous
 * (interpreter-wrapped CLIs report `node`).
 *
 * Three passes, most precise first:
 *
 * 1. argv0's basename against `leaderNames` (a compiled binary, e.g. Claude).
 * 2. For an interpreter argv0, the **first non-flag argument's basename** —
 *    the script being run. This is the case that matters in practice: a CLI
 *    installed on `PATH` is a symlink into the package, and `ps` reports the
 *    path *as invoked*, so argv reads
 *    `node /Users/x/.nvm/versions/node/v24.19.0/bin/pi -e ext.ts` — the
 *    package name appears nowhere. The script's own basename is the only
 *    identifier present (confirmed live, pi 0.84.2).
 * 3. Failing both, unambiguous package-path markers, for an install invoked
 *    through the package file itself (`node …/pi-coding-agent/dist/cli.js`).
 *
 * Every match is an **exact basename** or a full package path — never a bare
 * substring, which for a two-character name like `pi` would match half the
 * paths on a machine (the same trap the capture script's walk avoids).
 */
export function agentByProcessArgs(args: string): AgentDefinition | undefined {
  const trimmed = args.trim();
  if (!trimmed) return undefined;
  const tokens = trimmed.split(/\s+/);
  const byLeader = agentByLeader(tokens[0] ?? "");
  if (byLeader) return byLeader;

  if (SCRIPT_INTERPRETERS.has(leaderBasename(tokens[0] ?? ""))) {
    const script = tokens.slice(1).find((t) => !t.startsWith("-"));
    const byScript = script ? agentByLeader(script) : undefined;
    if (byScript) return byScript;
  }

  if (
    trimmed.includes("pi-coding-agent") ||
    trimmed.includes("@earendil-works/pi")
  ) {
    return agentById("pi");
  }
  return undefined;
}

/** The catalog entry with this id (as written into hook events / persisted). */
export function agentById(id: string): AgentDefinition | undefined {
  return AGENT_CATALOG.find((a) => a.id === id);
}

/** Agents that expose an installable hook — the rows the Settings → Agents
 * page renders. */
export function hookInstallableAgents(): (AgentDefinition & {
  resume: AgentHookResume;
})[] {
  return AGENT_CATALOG.filter(
    (a): a is AgentDefinition & { resume: AgentHookResume } =>
      a.resume.kind === "hook",
  );
}

/** Agents that resolve exact resume from their own session file (no Settings
 * toggle). Surfaced on the Agents settings page as a "works automatically"
 * note so users don't hunt for a missing Grok install row. */
export function sessionFileAgents(): (AgentDefinition & {
  resume: AgentSessionFileResume;
})[] {
  return AGENT_CATALOG.filter(
    (a): a is AgentDefinition & { resume: AgentSessionFileResume } =>
      a.resume.kind === "session-file",
  );
}

/**
 * Interpret an OSC sequence as an activity signal: try every catalog agent's
 * detectors in order, then the generic OSC-133 shell-integration fallback
 * (which isn't tied to any one agent). First non-null result wins.
 */
export function detectFromOsc(
  code: number,
  payload: string,
): DetectionResult | null {
  for (const agent of AGENT_CATALOG) {
    for (const detect of agent.activityDetectors) {
      const result = detect(code, payload);
      if (result) return result;
    }
  }
  return detectShellIntegration(code, payload);
}

/**
 * Contextual fallback tried only when `detectFromOsc` found nothing for this
 * OSC pair — a catalog agent's `idleAfterWorking` (only Codex has one today)
 * gets a chance to interpret it *given* whether this terminal was already in
 * an agent-sourced working state. First non-null result wins.
 */
export function detectIdleAfterWorking(
  code: number,
  payload: string,
  wasAgentWorking: boolean,
): DetectionResult | null {
  for (const agent of AGENT_CATALOG) {
    if (!agent.idleAfterWorking) continue;
    const result = agent.idleAfterWorking(code, payload, wasAgentWorking);
    if (result) return result;
  }
  return null;
}

/**
 * Interpret a raw PTY output chunk as an activity signal — for agents whose
 * status isn't reliably exposed via OSC at all (only Cursor Agent has an
 * `outputDetector` today). Tried independently of `detectFromOsc`/
 * `detectIdleAfterWorking`, on a separate raw-output subscription (see
 * `agents-service.ts`). First non-null result wins.
 */
export function detectFromOutput(chunk: string): DetectionResult | null {
  for (const agent of AGENT_CATALOG) {
    if (!agent.outputDetector) continue;
    const result = agent.outputDetector(chunk);
    if (result) return result;
  }
  return null;
}
