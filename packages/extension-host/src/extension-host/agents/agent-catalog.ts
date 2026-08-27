import {
  detectShellIntegration,
  type DetectionResult,
} from "./agent-osc-detectors";
import { renderTrackSessionScript } from "./agent-hook-script";
import {
  renderPiTrackSessionExtension,
  buildPiAgentDefinition,
} from "./catalog/pi";
import { buildClaudeAgentDefinition } from "./catalog/claude";
import { buildCodexAgentDefinition } from "./catalog/codex";
import { buildCursorAgentDefinition } from "./catalog/cursor";
import { buildCopilotAgentDefinition } from "./catalog/copilot";
import { grokAgent } from "./catalog/grok";
import { opencodeAgent } from "./catalog/opencode";

/**
 * The single source of truth for every coding agent Silo supports (RFC 0018).
 *
 * Before this catalog existed, per-agent knowledge was scattered across ~6
 * files (leader names, activity detectors, the hook command, the
 * settings-page install list, display names). Adding an agent meant touching
 * all of them, and nothing forced you to touch all of them. Now each agent is
 * **one entry**, and every subsystem derives its view from `AGENT_CATALOG`:
 *
 * - detection dispatch → `detectFromOsc` (OSC-based), `detectFromOutput`
 *   (raw-PTY fallback, e.g. Cursor's spinner), `detectIdleAfterWorking`
 *   (contextual fallback, e.g. Codex's plain-title idle)
 * - resume-hint gating → `agentByLeader` / `isKnownAgentLeader`
 * - hook install UI (Settings → Agents) → `hookInstallableAgents`
 * - hook-event display names → `agentById`
 *
 * As of ADR 0042 phase 7, every entry's definition lives in its own
 * `catalog/<id>.ts` module (sibling of this file, both now under this
 * package's `agents/` folder — see that folder's other files for the
 * detection/resume/hook machinery this catalog wires together) — this file
 * is the index, the shared types (`AgentDefinition` and friends), the shared
 * hook constants/builder (`SILO_HOOK_MARKER`, `buildHookCommand`, …) those
 * modules take as `deps` rather than import back, and the derived views
 * below. An agent whose resume needs those shared constants
 * (`claude`/`codex`/`cursor`/`copilot`) exports a
 * `build<Id>AgentDefinition(deps)` factory; one that doesn't (`grok`,
 * `opencode`, and pi's quirkier `catalog/pi.ts`) exports a plain object
 * instead. The original phase-2 motivation for splitting pi out first —
 * non-trivial runtime quirks needing an obvious home — still holds for
 * `catalog/pi.ts` specifically; phase 7 widened the trigger for *everyone
 * else* to plain navigability once the file passed ~1,000 lines, not quirks
 * (see the ADR's phase-7 implementation note).
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

/**
 * Host behavior for an agent's terminal/session handling that is not resume,
 * install, or detection data — the runtime quirks ADR 0042 exists to pull out
 * of host string branches (`agents-service.ts` must not branch on agent id).
 * Optional: a thin catalog entry (Claude, Codex, Cursor, Copilot, Grok) needs
 * none of this; a quirky agent (pi first) declares only the fields it needs.
 *
 * Wired as of phase 2: `processArgsMarkers` is read by `agentByProcessArgs`
 * below. `suppressShellIntegrationWhenIdentified` and `identityFromDetection`
 * are declared for audit-trail accuracy but select no code path — see the
 * phase-2 implementation note in the ADR for why (both were already generic
 * before this type existed).
 */
export interface AgentRuntimePolicy {
  /**
   * Once this agent's id is stamped onto a terminal, ignore the generic
   * shell-integration OSC 133 A/B/C zone detector for it — for an agent that
   * also emits OSC 133 as incidental shell-integration noise around its own
   * turns (pi), so that noise isn't misread as `source: "shell"` activity
   * once the real agent is already known.
   */
  suppressShellIntegrationWhenIdentified?: boolean;
  /**
   * True when a match from this agent's own OSC/output detectors should stamp
   * catalog identity onto the terminal immediately, even before a hook
   * confirms the session — for an agent identifiable only by an OSC title
   * with no other signal (pi's `π - …` title).
   */
  identityFromDetection?: boolean;
  /**
   * Substring markers that identify this agent from a node/bun/deno-wrapped
   * process's full argv when neither argv0 nor the script basename matches
   * `leaderNames` directly — `agentByProcessArgs`'s package-path fallback
   * (pi: `"pi-coding-agent"`, `"@earendil-works/pi"`). Each marker is matched
   * as a whole path/package segment via `includesPathMarker`, never as a bare
   * substring.
   */
  processArgsMarkers?: string[];
}

/**
 * A settings-page toggle for a prerequisite this agent needs before its
 * activity detectors can fire at all — an off-by-default setting in the
 * agent's *own* config that gates the OSC/output signal Silo reads (pi's
 * `terminal.showTerminalProgress`; Cursor's `showStatusIndicators` is the
 * same class of problem per ADR 0042, not yet migrated to this mechanism).
 * Declared as catalog metadata so Settings → Agents can render the row
 * generically instead of an `agent.id === "pi"` branch in UI code.
 *
 * The settings object is untyped (`Record<string, unknown>`) here because
 * `extensions-core` (where the settings page lives) is allowed to depend on
 * this host package, never the reverse — so `isEnabled` / `setEnabled` are
 * owned and defined right on the agent's own module (e.g. `agents/pi.ts`),
 * not imported from an `extensions-core` sibling. `index.tsx` calls them
 * generically through this interface without knowing which agent it's
 * driving.
 *
 * Wired as of phase 4b: `index.tsx` renders any row whose agent declares
 * this field, keyed by agent id — pi is the only declarer today; Cursor's
 * `showStatusIndicators` is the next candidate (see the ADR's open question).
 */
export interface AgentExtraSettingsToggle {
  /** Row label shown beneath the agent's row, e.g. `"Terminal progress"`. */
  label: string;
  /** Hint text shown under the label when there's no read/write error. */
  hint: string;
  /** Path to the agent's own settings file, relative to `$HOME` (POSIX
   * slashes), e.g. `.pi/agent/settings.json`. */
  settingsPathRel: string;
  /** Reads whether the toggle is currently on from the agent's parsed
   * settings object (an empty object when the file doesn't exist yet). */
  isEnabled: (settings: Record<string, unknown>) => boolean;
  /** Returns a new settings object with the toggle set to `enabled`. Pure —
   * the caller owns reading/writing the file. */
  setEnabled: (
    settings: Record<string, unknown>,
    enabled: boolean,
  ) => Record<string, unknown>;
}

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
  /**
   * A literal prefix this agent's own OSC 0 title carries that is purely
   * self-identification (pi's `"π - "`, OpenCode's `"OC | "`) — redundant
   * once the tab is already showing that agent's icon, since the icon says
   * the same thing visually. `core.terminal` strips it via
   * {@link stripAgentTitleIdentityPrefix}, and only when
   * `ctx.terminals.getIcons` confirms an icon is actually rendered for that
   * tab; left alone otherwise; the prefix is then the tab's only identity
   * signal. Undefined for every agent whose title doesn't lead with its own
   * name (most don't — Claude's spinner/idle marker is a status signal, not
   * an identity one, and is handled separately by `stripAgentStatusMarkers`).
   */
  titleIdentityPrefix?: string;
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
  /** Host runtime quirks beyond resume/install/detection data. Undefined for
   * every thin catalog entry; only a quirky agent (pi) declares one. */
  runtime?: AgentRuntimePolicy;
  /** An extra settings-page toggle this agent needs before its activity
   * detectors can fire. Undefined for every agent that doesn't gate its
   * activity signal behind its own off-by-default setting. */
  extraSettingsToggle?: AgentExtraSettingsToggle;

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

/**
 * What a thin, hook-resuming agent's `build<Id>AgentDefinition(deps)` factory
 * needs from this module rather than importing back — the same shape
 * `catalog/pi.ts`'s `PiAgentDeps` established (minus `trackScriptRel`, which
 * only pi's extension-file template needs). One shared interface here
 * because all four current implementers (`claude`, `codex`, `cursor`,
 * `copilot`) need exactly this and nothing more; an agent whose resume
 * doesn't need a hook at all (`grok`, `opencode`) skips this and exports a
 * plain object instead.
 */
export interface HookAgentDeps {
  /** {@link SILO_HOOK_MARKER} — passed through, not reimported. */
  marker: string;
  /** This module's shared hook-command builder. */
  buildHookCommand: (agentId: string) => string;
}

// Pi's full AgentDefinition lives in catalog/pi.ts (ADR 0042 phase 4) — it was
// the one entry with non-trivial runtime quirks (decision 2) and the first to
// move. Phase 7 moved every other entry out too, purely for this file's
// navigability (see the module doc above) — each below takes the same `deps`
// shape (or none, for the two that need no shared hook constants) so this
// module stays the SSOT for `SILO_HOOK_MARKER`/`buildHookCommand` with no
// runtime import cycle back into any agent module.
const pi: AgentDefinition = buildPiAgentDefinition({
  marker: SILO_HOOK_MARKER,
  trackScriptRel: TRACK_SCRIPT_REL,
  buildHookCommand,
});
const claude: AgentDefinition = buildClaudeAgentDefinition({
  marker: SILO_HOOK_MARKER,
  buildHookCommand,
});
const codex: AgentDefinition = buildCodexAgentDefinition({
  marker: SILO_HOOK_MARKER,
  buildHookCommand,
});
const cursor: AgentDefinition = buildCursorAgentDefinition({
  marker: SILO_HOOK_MARKER,
  buildHookCommand,
});
const copilot: AgentDefinition = buildCopilotAgentDefinition({
  marker: SILO_HOOK_MARKER,
  buildHookCommand,
});

/** Every agent Silo knows about. Order is the detection-dispatch order. */
export const AGENT_CATALOG: AgentDefinition[] = [
  claude,
  codex,
  cursor,
  copilot,
  grokAgent,
  pi,
  opencodeAgent,
];

// ---- derived views ----------------------------------------------------------

/** `leader` is observed to be a full path on some installs (e.g. a
 * Bun-compiled `claude` reporting as `/Users/x/.local/bin/claude`, not bare
 * `claude`) — match on the basename, not the whole string. */
export function leaderBasename(leader: string): string {
  // Windows reports a bare executable name with its extension (`copilot.exe`)
  // and uses `\` as the separator; Unix reports a path with `/` and no
  // extension. `leaderNames` is written the Unix way, so normalize to that —
  // without this, no agent matches on Windows at all.
  const idx = Math.max(leader.lastIndexOf("/"), leader.lastIndexOf("\\"));
  const base = idx >= 0 ? leader.slice(idx + 1) : leader;
  return base.replace(/\.(exe|cmd|bat|com)$/i, "");
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

  // Generic over every catalog entry's `runtime.processArgsMarkers` (ADR
  // 0042 phase 5) — pi is the only declarer today, but nothing here is
  // pi-specific; the next node-wrapped quirky agent just declares its own
  // markers and this loop picks it up with no changes here.
  for (const agent of AGENT_CATALOG) {
    const markers = agent.runtime?.processArgsMarkers;
    if (!markers) continue;
    if (markers.some((marker) => includesPathMarker(trimmed, marker))) {
      return agent;
    }
  }
  return undefined;
}

/** True when `marker` occurs in `haystack` as a whole path/package segment,
 * not as a bare substring straddling an unrelated word — e.g. the marker
 * `pi-coding-agent` must not match inside `api-coding-agent` (index 1), and
 * `@earendil-works/pi` must not match inside `@earendil-works/pixel-tool`.
 * A boundary is anything that can't extend an identifier: start/end of
 * string, or any character other than a letter, digit, `_`, `-`, or `@`. */
function includesPathMarker(haystack: string, marker: string): boolean {
  const idx = haystack.indexOf(marker);
  if (idx < 0) return false;
  const isBoundary = (ch: string | undefined) =>
    ch === undefined || !/[\w@-]/.test(ch);
  return (
    isBoundary(idx > 0 ? haystack[idx - 1] : undefined) &&
    isBoundary(
      idx + marker.length < haystack.length
        ? haystack[idx + marker.length]
        : undefined,
    )
  );
}

/** The catalog entry with this id (as written into hook events / persisted). */
export function agentById(id: string): AgentDefinition | undefined {
  return AGENT_CATALOG.find((a) => a.id === id);
}

/**
 * Strip `agentId`'s {@link AgentDefinition.titleIdentityPrefix} from `title`,
 * if it has one and `title` leads with it. The caller — `core.terminal` — is
 * responsible for only calling this once it has confirmed (via
 * `ctx.terminals.getIcons`) that the tab is actually showing an icon for this
 * terminal; this function itself has no opinion on that, since the catalog
 * doesn't know about icons or tab chrome.
 */
export function stripAgentTitleIdentityPrefix(
  agentId: string | undefined,
  title: string,
): string {
  const prefix = agentId ? agentById(agentId)?.titleIdentityPrefix : undefined;
  return prefix && title.startsWith(prefix)
    ? title.slice(prefix.length)
    : title;
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
 *
 * `agentCatalogId` is the terminal's already-established identity, when there
 * is one: once we know *which* agent is running, only that agent's fallback
 * may speak for it. Without this gate Codex's "any plain title ends the turn"
 * rule fires for every agent — e.g. Copilot shelling out sets the title to
 * `"Windows PowerShell"`, which would end Copilot's turn mid-task.
 */
export function detectIdleAfterWorking(
  code: number,
  payload: string,
  wasAgentWorking: boolean,
  agentCatalogId?: string | null,
): DetectionResult | null {
  for (const agent of AGENT_CATALOG) {
    if (!agent.idleAfterWorking) continue;
    if (agentCatalogId && agent.id !== agentCatalogId) continue;
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
