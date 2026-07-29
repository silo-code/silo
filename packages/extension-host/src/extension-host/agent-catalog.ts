import {
  detectClaudeCode,
  detectCodexCLI,
  detectCodexIdleAfterWorking,
  detectCopilotCLI,
  detectCursorAgent,
  detectCursorAgentOutput,
  detectShellIntegration,
  type DetectionResult,
} from "./agent-osc-detectors";

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
 * `hook-installer.ts`; Cursor and Copilot each have a dedicated module)
 * because the on-disk schemas differ.
 */
export type HookInstallStrategy =
  | "claude-settings"
  | "cursor-hooks-json"
  | "copilot-hooks-dir";

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

export interface AgentNoResume {
  kind: "none";
}

export type AgentResume = AgentHookResume | AgentNoResume;

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
 * Build the shared POSIX-shell session-capture script (RFC 0019). One script
 * serves every agent — the walk logic is agent-independent; the per-agent tag
 * arrives as `$1`. It reads the hook's JSON payload from stdin, extracts the
 * session id, walks up from its own PPID to the real agent process (raw PPID
 * can be a Cursor setpgrp worker or a Claude/Codex tool subprocess), and
 * appends one event line to `~/.silo/agent-hooks/events.jsonl` tagged with the
 * resolved **process-group id** (the reader in `agent-hook-events.ts` matches
 * that against a terminal's foreground pgid).
 *
 * This deliberately replaces the former inline `python3 -c
 * "…exec(base64.b64decode('…'))"` command, which (a) tripped endpoint-security
 * tools on the obfuscated-`exec` signature and (b) assumed a Python interpreter
 * that isn't guaranteed on any platform. `/bin/sh` — the very process that runs
 * the hook — plus POSIX `ps`/`printf`/`date`/`mkdir` are all guaranteed on
 * macOS and Linux (the feature's supported surface). No `eval`, no `base64`,
 * no network, no broad process enumeration (`ps -p <pid>` is targeted).
 *
 * Session-id extraction uses pure shell parameter expansion (no `sed`
 * backreferences), tolerant of both `session_id` (Claude/Codex) and `sessionId`
 * (Cursor/Copilot) spellings. `cwd` is deliberately **not** written: nothing
 * consumes it, and dropping it makes every remaining field escaping-safe by
 * construction (integer pgid / UUID / catalog slug / `date -u` string), so a
 * `printf`-built line can never be malformed in a way that loses the session
 * id. The `$SILO_TERMINAL_ID` branch is the reserved seam for RFC 0020's
 * Silo-spawned fast path; today it falls through to the walk.
 */
export function buildTrackSessionScript(): string {
  return [
    "#!/bin/sh",
    "# Silo session tracking (getsilo.dev) — records which agent session is",
    "# running in a terminal so Silo can offer an exact resume command.",
    "# Safe to inspect. Managed by Silo; see Settings > Agents.",
    `# Marker: ${SILO_HOOK_MARKER}`,
    'agent="$1"',
    "payload=$(cat | tr '\\n' ' ')",
    "",
    "# Extract the session id (both key spellings) via parameter expansion —",
    "# no sed, no regex backslashes; session ids are UUIDs so this is safe.",
    "sid=",
    'case "$payload" in',
    "  *'\"session_id\"'*) rest=${payload#*'\"session_id\"'} ;;",
    "  *'\"sessionId\"'*)  rest=${payload#*'\"sessionId\"'} ;;",
    "  *) rest= ;;",
    "esac",
    'if [ -n "$rest" ]; then',
    "  rest=${rest#*'\"'}     # drop through the value's opening quote",
    "  sid=${rest%%'\"'*}     # value is up to the next quote",
    "fi",
    '[ -n "$sid" ] || exit 0  # nothing to record without a session id',
    "",
    "# Forward-compat seam (RFC 0020): Silo-spawned agents inherit",
    "# $SILO_TERMINAL_ID and can be matched directly, skipping the walk.",
    "# Structured env-var-first so 0020 slots in additively; empty today.",
    'if [ -n "$SILO_TERMINAL_ID" ]; then',
    "  : # RFC 0020 fills this in (write a terminal-id-keyed event, then exit).",
    "fi",
    "",
    "# Walk parents from our PPID to the real agent process, then take its pgid.",
    "# Prefer an EXACT argv0-basename match ($exact) over a mere substring match",
    "# ($sub). Cursor runs the hook from a setpgrp worker whose argv references",
    "# the cursor-agent path (so it substring-matches) but whose basename is not",
    "# an agent — stopping there yields the worker's own pgid, not the terminal's",
    "# foreground group (confirmed live: worker pgid 99940 vs cursor-agent 98143).",
    "# Exact-first climbs past that worker to cursor-agent; substring stays as the",
    "# fallback for node-wrapped agents whose argv0 is 'node' (Claude/Copilot).",
    `KNOWN="${knownAgentNames()}"`,
    "pid=$PPID; exact=; sub=",
    "i=0",
    'while [ "$i" -lt 12 ] && [ "${pid:-0}" -gt 1 ]; do',
    '  args=$(ps -p "$pid" -o args= 2>/dev/null)',
    '  [ -n "$args" ] || break',
    "  base=${args%% *}; base=${base##*/}",
    "  for k in $KNOWN; do",
    '    [ "$base" = "$k" ] && { exact=$pid; break; }',
    "  done",
    '  [ -n "$exact" ] && break',
    '  if [ -z "$sub" ]; then',
    "    for k in $KNOWN; do",
    '      case "$args" in *"$k"*) sub=$pid; break ;; esac',
    "    done",
    "  fi",
    "  pid=$(ps -p \"$pid\" -o ppid= 2>/dev/null | tr -d ' ')",
    "  i=$((i + 1))",
    "done",
    "target=${exact:-${sub:-$PPID}}",
    "pgid=$(ps -p \"$target\" -o pgid= 2>/dev/null | tr -d ' ')",
    '[ -n "$pgid" ] || exit 0',
    "",
    'dir="$HOME/.silo/agent-hooks"; mkdir -p "$dir"',
    "ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    'printf \'{"pid":%s,"sessionId":"%s","agent":"%s","timestamp":"%s"}\\n\' \\',
    '  "$pgid" "$sid" "$agent" "$ts" >> "$dir/events.jsonl"',
    "",
  ].join("\n");
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
    "depends on Claude emitting a braille-spinner glyph (U+2800–28FF) while " +
    "working and a '✳' marker when awaiting input.",
  upstreamRefs: [
    "https://docs.claude.com/en/docs/claude-code/hooks",
    "https://docs.claude.com/en/docs/claude-code/settings",
  ],
  lastVerified: "2026-07-27",
  // Left undefined until the first audit-skill run pins the current version.
  verifiedAgainstVersion: undefined,
};

const codex: AgentDefinition = {
  id: "codex",
  displayName: "Codex CLI",
  leaderNames: ["codex"],
  // "Working" is the shared Claude/Codex braille-spinner detector (Codex uses
  // the same range); detectCodexCLI covers its own explicit "idle" signals
  // (empty title, action-required markers, specific OSC 9 notifications).
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
    "'working' shares Claude's braille-spinner OSC 0 detector (same glyph " +
    "range, confirmed shared upstream); 'idle' comes from either an empty " +
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
  // `cursor-agent` is the binary basename on PATH installs; `agent` is the
  // common shim name (`~/.local/bin/agent` → cursor-agent).
  leaderNames: ["cursor-agent", "agent"],
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
    // same UUID as `conversation_id` and works with `agent --resume <id>`.
    buildResumeCommand: (sessionId) => `agent --resume ${sessionId}`,
  },
  docsUrl: "https://getsilo.dev/guide/agent-sessions#cursor-agent",
  contract:
    "Exact resume depends on Cursor CLI's sessionStart hook in " +
    "~/.cursor/hooks.json: (1) schema is `{ version: 1, hooks: { " +
    "sessionStart: [{ command }] } }` (camelCase event, flat command " +
    "entries — NOT Claude's hooks.<Event>[].hooks[] shape); (2) CONFIRMED " +
    "live against cursor-agent 2026.07.23 (2026-07-28): CLI fires " +
    "sessionStart with JSON stdin carrying `session_id` (= conversation_id); " +
    "(3) the hook walks parents from its PPID to find the agent process and " +
    "records that process's pgid (raw PPID/getpgid(ppid) miss Cursor workers " +
    "that setpgrp); (4) " +
    "`agent --resume <id>` (or `cursor-agent --resume <id>`) resumes by that " +
    "id. Activity detection (ported from silo-extensions/agent-monitor, " +
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

/** Every agent Silo knows about. Order is the detection-dispatch order. */
export const AGENT_CATALOG: AgentDefinition[] = [
  claude,
  codex,
  cursor,
  copilot,
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
