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
 * The single source of truth for every coding agent Silo supports (RFC 0017).
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
 * `registerAgent`; see RFC 0017 "Detection is sealed, not pluggable"). The
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
 * than dumbly diffing docs) before flagging anything. See RFC 0017
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

/**
 * Exact-resume capability for an agent: either it exposes a session-start
 * hook Silo can install (`kind: "hook"`), or it doesn't and the terminal
 * only ever gets the honest generic hint (`kind: "none"`). A discriminated
 * union so "this agent has no exact-resume path" is a first-class, encoded
 * state — not a gap someone forgot to fill.
 */
export interface AgentHookResume {
  kind: "hook";
  /** Path to the agent's settings file, relative to `$HOME` (POSIX slashes).
   * NOTE: the install/merge logic (`hook-installer.ts`) currently assumes a
   * Claude-style `settings.json` (`hooks.<Event>[].hooks[]`). A genuinely
   * different-shaped config (e.g. Cursor's `hooks.json`) will need its own
   * install strategy when it's added — this union is the seam for that. */
  configPath: string;
  /** Lifecycle event the hook attaches to, e.g. `"SessionStart"`. */
  hookEvent: string;
  /** Marker embedded in the built command (always {@link SILO_HOOK_MARKER}). */
  marker: string;
  /** Builds the single-line shell command the hook runs. Must embed
   * `marker` and write one JSON line to `~/.silo/agent-hooks/events.jsonl`
   * (see `agent-hook-events.ts`). */
  buildCommand: () => string;
  /** Builds the exact resume command for a captured session id, e.g.
   * `claude --resume <id>` / `codex resume <id>`. Per-agent because the
   * syntax differs; this is what `applyHookMatch` surfaces as the terminal's
   * `resumeCommand` once the hook reports an exact id. */
  buildResumeCommand: (sessionId: string) => string;
  /** Optional human-readable label written onto the installed entry (passed
   * through to `HookInstallSpec.statusMessage`) for agents whose schema
   * supports one (Codex's `statusMessage` field) — an extra attribution
   * layer for a human reviewing the hook, on top of the command's own
   * leading identifier (see `buildPythonHookCommand`). Undefined for agents
   * whose schema doesn't have an equivalent field (Claude Code). */
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
 * The session-capture hook command: a single-line `python3` one-liner (no new
 * runtime dependency beyond what the agent CLI itself assumes) that reads the
 * hook's JSON stdin payload and appends one event line, tagged with `agentId`.
 * Single-line with no conditional blocks so no newline is ever needed — it
 * always writes a line, even with an empty session id, and the host-side
 * reader skips empty ones. Shared by every agent whose SessionStart payload
 * exposes a `session_id`/`sessionId` field (Claude and Codex both do).
 *
 * The **leading** `_='Silo session tracking (getsilo.dev)'` no-op assignment
 * exists purely for human review, not behavior — confirmed necessary in
 * testing: an agent that gates a new hook behind manual trust approval (see
 * Codex's `postInstallNote`) shows the reviewer a *truncated* command
 * preview, and `SILO_HOOK_MARKER` is embedded as a trailing `#` comment,
 * which never survives that truncation. Putting a human-readable identifier
 * first means a user reviewing an unfamiliar hook can actually tell it's
 * Silo's before approving it, rather than trusting an opaque `python3 -c
 * "import json,sys,os,…`. `SILO_HOOK_MARKER` itself stays at the end — it's
 * the exact, code-matched string `hasHookInstalled`/uninstall key off of, not
 * a display concern, so it isn't duplicated up front.
 */
function buildPythonHookCommand(agentId: string): string {
  const script =
    "_='Silo session tracking (getsilo.dev)';" +
    "import json,sys,os,datetime;" +
    "d=json.load(sys.stdin);" +
    "sid=d.get('session_id') or d.get('sessionId') or '';" +
    "os.makedirs(os.path.expanduser('~/.silo/agent-hooks'),exist_ok=True);" +
    "open(os.path.expanduser('~/.silo/agent-hooks/events.jsonl'),'a').write(" +
    `json.dumps({'pid':os.getppid(),'sessionId':sid,'cwd':d.get('cwd',''),'agent':'${agentId}','timestamp':datetime.datetime.utcnow().isoformat()+'Z'})` +
    "+chr(10))";
  return `python3 -c "${script}" # ${SILO_HOOK_MARKER}`;
}

const claude: AgentDefinition = {
  id: "claude",
  displayName: "Claude Code",
  leaderNames: ["claude"],
  activityDetectors: [detectClaudeCode],
  resume: {
    kind: "hook",
    configPath: ".claude/settings.json",
    hookEvent: "SessionStart",
    marker: SILO_HOOK_MARKER,
    buildCommand: () => buildPythonHookCommand("claude"),
    buildResumeCommand: (sessionId) => `claude --resume ${sessionId}`,
  },
  docsUrl: "https://getsilo.dev/guide/agent-sessions#claude-code",
  contract:
    "Exact resume depends on Claude Code's SessionStart hook: (1) hooks are " +
    "configured in ~/.claude/settings.json under hooks.SessionStart[].hooks[] " +
    "as { type: 'command', command }; (2) the hook receives a JSON stdin " +
    "payload carrying a session id (field `session_id`, or `sessionId`) and " +
    "`cwd`; (3) the hook process's PPID is the claude process's own PID (used " +
    "to correlate against the terminal's foreground pgid). Activity detection " +
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
    // Same shape as Claude's settings.json (hooks.SessionStart[].hooks[]), and
    // the same `session_id` payload field — so it reuses the installer and
    // hook command verbatim, only the agent tag and resume command differ.
    configPath: ".codex/hooks.json",
    hookEvent: "SessionStart",
    marker: SILO_HOOK_MARKER,
    buildCommand: () => buildPythonHookCommand("codex"),
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
  leaderNames: ["cursor-agent"],
  // OSC 0 title status (preferred), ported from silo-extensions/agent-monitor.
  // Only emitted when `display.showStatusIndicators` is true in
  // ~/.cursor/cli-config.json — the upstream *default is false* — so the raw
  // output fallback below is what most installs actually rely on.
  activityDetectors: [detectCursorAgent],
  // Ink TUI spinner frames land in the raw PTY stream regardless of the OSC
  // config flag — this is the fallback that works out of the box.
  outputDetector: detectCursorAgentOutput,
  // Cursor DOES support session hooks and exact resume by id
  // (`cursor-agent --resume <id>`, chats under ~/.cursor/chats), but its
  // ~/.cursor/hooks.json uses a *different schema* than the
  // hooks.<Event>[].hooks[] shape Silo's installer writes — so Silo cannot
  // safely auto-install it yet (writing the wrong shape would corrupt the
  // user's config). Encoded as `none` (detection + honest generic hint only)
  // until a Cursor-shaped installer exists. This is a statement about *Silo's*
  // current capability, not a claim that Cursor lacks the feature. Follow-up:
  // a per-agent install strategy (or a Cursor `resume` variant) + confirming
  // the exact payload field carrying the resumable id.
  resume: { kind: "none" },
  docsUrl: "https://getsilo.dev/guide/agent-sessions#cursor-agent",
  contract:
    "Resume: Silo recognizes the `cursor-agent` leader and gives a generic " +
    "resume hint. Exact resume is possible upstream (`cursor-agent --resume " +
    "<id>`) via a SessionStart hook in ~/.cursor/hooks.json, but that file's " +
    "schema differs from the shape Silo's installer writes, so auto-install " +
    "is a follow-up. Activity detection (ported from " +
    "silo-extensions/agent-monitor, 2026-07-28): preferred signal is an OSC " +
    "0 title of the form '<name> - <emoji?> <status>' — but only emitted " +
    "when `display.showStatusIndicators` is true in ~/.cursor/cli-config.json " +
    "(default false); the fallback (what most installs actually hit) matches " +
    "known ink-spinner byte sequences in the terminal's raw output stream " +
    "instead, ending on ~1.5s of silence after the last frame (no explicit " +
    "'idle' signal exists in raw output).",
  upstreamRefs: [
    "https://docs.cursor.com/en/cli/reference/hooks",
    "https://docs.cursor.com/en/cli/overview",
  ],
  lastVerified: "2026-07-27",
};

const copilot: AgentDefinition = {
  id: "copilot",
  displayName: "GitHub Copilot CLI",
  leaderNames: ["copilot"],
  // OSC 9;4 (ConEmu/Windows Terminal progress protocol), ported from
  // silo-extensions/agent-monitor. No hook/session mechanism is known for
  // this CLI yet — resume is `none` until one is confirmed, same honest-gap
  // treatment as Cursor.
  activityDetectors: [detectCopilotCLI],
  resume: { kind: "none" },
  docsUrl: "https://getsilo.dev/guide/agent-sessions#github-copilot-cli",
  contract:
    "Detection only: 'copilot' is the confirmed leader/binary name (per " +
    "`npm install -g @github/copilot`, `copilot` to launch). Activity comes " +
    "from OSC 9;4 progress notifications — payload '4;<state>' — with " +
    "state 1/2/3 = working and state 0/4 = idle. No session-hook or " +
    "resume-by-id mechanism has been confirmed for this CLI, so exact resume " +
    "is out of scope until one is found; this entry exists for activity " +
    "detection parity only.",
  upstreamRefs: [
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
