import type { Disposable } from "./types";
import type { TerminalKind } from "./domain-types";

// `ctx.agents` — host-computed coding-agent activity and resume-identity
// observability. See RFC 0018 (docs/proposals/0018-ctx-agents-surface.md).
// Detection is fully sealed inside the host implementation — there is no
// registration API for detectors or resume-hint resolvers. Extensions only
// ever read this surface.

/**
 * What a terminal's agent is currently doing, as classified by the host from
 * OSC/output signals. `"none"` means no agent activity has been observed
 * (including plain, non-agent shells). `"idle"` means the agent finished its
 * last turn and is waiting for the next input — this is purely a fact about
 * the agent itself, independent of whether anyone is looking at the
 * terminal; see {@link AgentInfo.needsAttention} for the separate "has a
 * human seen this" signal (an earlier design conflated the two into a
 * `"waiting"`/`"done"` split on `activity` itself — dropped once it turned
 * out to carry no information `needsAttention` didn't already have).
 * `"dead"` is distinct from a merely `stale` restored state — see
 * {@link AgentInfo.stale} — and means the terminal's backend was confirmed
 * gone (no daemon to reattach to) after an unclean shutdown; nothing will
 * arrive to resolve this on its own.
 *
 * @category Core Types
 * @public
 * @beta
 */
export type AgentActivity = "none" | "working" | "idle" | "error" | "dead";

/**
 * Live agent-activity and resume-identity state for one terminal, computed
 * once by the host and shared across every subscriber — never recomputed
 * per-extension. Returned by {@link AgentsService.getState} and
 * {@link AgentsService.getByTerminalId}; delivered to
 * {@link AgentsService.subscribe} listeners on every change.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentInfo {
  /** The terminal record id this state belongs to. */
  readonly terminalId: string;
  /** The workspace this terminal belongs to. */
  readonly workspaceId: string;
  /**
   * The terminal's kind at registration time.
   *
   * @deprecated Always `"shell"` after RFC 0033 — the deprecated `"claude"` /
   * `"pi"` kinds are normalized away at load and nothing creates them, so a
   * consumer branching on this is reading a constant. Use
   * {@link AgentInfo.agentId} for which agent is running, and
   * {@link AgentInfo.isAgent} for whether one is.
   */
  readonly kind: TerminalKind;
  /**
   * Whether this terminal currently hosts an agent — true if it was created
   * as one, or an agent-specific signal was observed in it (e.g. typing
   * `claude` into a plain shell).
   */
  readonly isAgent: boolean;
  /** Current classified activity. */
  readonly activity: AgentActivity;
  /**
   * Sticky "finished, go look" flag: set when the agent goes idle in a
   * terminal that wasn't the active one at that moment, and cleared only by
   * {@link AgentsService.acknowledge}. Never set at all if the terminal
   * *was* already active the instant the agent went idle — being watched
   * live counts as already seen, no acknowledgment needed.
   */
  readonly needsAttention: boolean;
  /** ISO timestamp of when `needsAttention` was set; undefined when not pending. */
  readonly attentionSince?: string;
  /** ISO timestamp of when the current `"working"` phase started; undefined otherwise. */
  readonly workingSince?: string;
  /**
   * Soft, time-gap-based, **self-clearing** signal: this restored `working`/
   * `needsAttention` duration followed a gap long enough that it can't be
   * fully trusted — the agent may have finished without it being observed.
   * The next live signal clears it automatically. Distinct from
   * `activity === "dead"`, which is a hard, structural, non-self-resolving
   * fact — see {@link AgentActivity}.
   */
  readonly stale: boolean;
  /**
   * Exact session identifier for the agent running in this terminal, when one
   * could be determined. Present only when an opt-in `SessionStart` hook has
   * reported it (see the Settings → Agents page); absent otherwise — Silo
   * never *infers* a session id by directory/recency, since that can silently
   * resolve to the wrong session. Populated live once the hook fires (not
   * deferred to death), then persisted, so a consumer reacting to
   * `activity === "dead"` can read it back.
   */
  readonly sessionId?: string;
  /**
   * A ready-to-show (and copy/paste) resume hint. Either an exact
   * `"claude --resume 01abc..."` (when {@link AgentInfo.sessionId} was
   * resolved via a hook) or an honest, session-id-less
   * `"was running claude in ~/foo"` note (when it wasn't). Attached the first
   * time the terminal's agent is detected and persisted, so it is available
   * both live and at `activity === "dead"`.
   */
  readonly resumeCommand?: string;
  /**
   * Human-readable agent name, e.g. `"Claude Code"` or `"Codex CLI"`. Tells
   * you *which* agent CLI is running in this terminal, independent of
   * whether an exact session id was ever resolved — populated as soon as a
   * known agent leader is detected at all (same moment
   * {@link AgentInfo.resumeCommand} is first attached), not deferred until
   * {@link AgentInfo.sessionId} is available.
   */
  readonly agentName?: string;
  /**
   * Stable catalog key for the agent, e.g. `"claude"` or `"codex"` — unlike
   * {@link AgentInfo.agentName} (a display string meant for showing to the
   * user), this is meant for an extension's own code to switch or compare
   * on, and won't change if the display name is ever reworded. Populated at
   * the same moment and lifecycle as `agentName`.
   */
  readonly agentId?: string;
}

/**
 * A Catalog Agent's brand mark — SVG path data plus the two theme-dependent
 * hexes. Consumed by {@link AgentIconGlyph}; a single hex cannot have enough
 * contrast against both a light and a dark tab strip, so `"color"` mode picks
 * `hexLight` / `hexDark` by the host's active base.
 *
 * @category Consumer Services
 * @public
 */
export interface AgentIcon {
  /** Display name, for the glyph's accessible label. */
  title: string;
  /** The brand's color against a light background, no leading `#`. */
  hexLight: string;
  /** The brand's color against a dark background, no leading `#`. */
  hexDark: string;
  /** SVG path data, `viewBox="0 0 24 24"`. */
  path: string;
  /** Set when the source path assumes `fill-rule: evenodd`; omit for the SVG
   *  default (`nonzero`). */
  fillRule?: "evenodd";
  /** A second path (same viewBox) layered on {@link AgentIcon.path} at 40%
   *  opacity, for a genuinely duotone mark (OpenCode's frame + inner panel). */
  accentPath?: string;
  /** `fill-rule` for {@link AgentIcon.accentPath}, independent of `fillRule`. */
  accentFillRule?: "evenodd";
}

/**
 * How {@link AgentIconGlyph} renders: `"none"` draws nothing, `"color"` tints
 * with the brand hex, `"monotone"` inherits `currentColor`.
 *
 * @category Consumer Services
 * @public
 */
export type AgentIconMode = "none" | "color" | "monotone";

/**
 * One Catalog Agent as an extension may read it through
 * {@link AgentsService.catalog}. Read-only — detection stays sealed (ADR 0028)
 * and there is no way to register into the catalog.
 *
 * @category Consumer Services
 * @public
 */
export interface CatalogAgentSummary {
  readonly id: string;
  readonly displayName: string;
  readonly icon?: AgentIcon;
}

/**
 * One **Agent Profile** as an extension may read it through
 * {@link AgentProfilesService.list} — a named recipe for starting a coding
 * agent in a terminal, defined by the user on Settings → Agents → Profiles.
 * Deliberately a summary, never the host's own profile record: the command
 * line, its config directory, and every other launch detail stay host-owned
 * (RFC 0033).
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentProfileSummary {
  /** Stable id — pass it to {@link AgentProfilesService.launch}. */
  readonly id: string;
  /** The user's own name for this profile, e.g. `"Claude (work)"`. Show this;
   *  never show or parse the id. */
  readonly label: string;
  /** True for the single profile marked default, which is what `launch()`
   *  starts when no `profileId` is given. False for every profile when the
   *  user has not chosen one. */
  readonly isDefault: boolean;
  /**
   * Whether this profile's agent can be given an **opening prompt**. A static
   * fact about the agent, not about any particular launch — so a picker can
   * grey out or annotate a profile up front instead of discovering
   * `"agent-takes-none"` after the user has already typed one.
   */
  readonly acceptsPrompt: boolean;
}

/**
 * Why an opening prompt could not be delivered. Silo refuses rather than
 * approximating: a prompt it cannot quote exactly is never typed, and no agent
 * is started without the prompt the caller asked for.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export type PromptRefusal =
  /** The profile matches no agent Silo knows, so there is no way to tell how
   *  its CLI takes a prompt. The user can fix this by setting the agent on the
   *  profile. */
  | "no-agent"
  /** The profile's agent has no way to accept an opening prompt while staying
   *  interactive. Check {@link AgentProfileSummary.acceptsPrompt} first to
   *  avoid offering a prompt for such a profile at all. */
  | "agent-takes-none"
  /** Silo has no exact quoting rule for the shell this terminal would run and
   *  will not guess one. bash, zsh, and fish are supported. */
  | "unsupported-shell"
  /**
   * The prompt exceeds Silo's 2 KiB limit — roughly a page of prose.
   *
   * The ceiling is low because the prompt is *typed* into the user's shell,
   * and a shell with syntax highlighting or autosuggestions cannot reliably
   * consume more than a few KiB in one go. Silo refuses well short of where
   * delivery starts failing, because a truncated prompt would reach the agent
   * looking complete. Trim it and retry.
   */
  | "too-large";

/**
 * Options for {@link AgentProfilesService.launch}. Every field is optional —
 * a bare `launch()` starts the default profile in the active workspace.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface LaunchAgentProfileOptions {
  /** Which profile to start. Defaults to the one marked default, else the
   *  first — the same profile the built-in "New Agent" command uses. */
  profileId?: string;
  /** Which workspace to start it in. Defaults to the active one. A
   *  background workspace works: the session is spawned eagerly, since no
   *  panel will mount to do it. */
  workspaceId?: string;
  /** Working directory for the new terminal. Defaults to the workspace folder. */
  cwd?: string;
  /**
   * An opening prompt to hand the agent on its launch line.
   *
   * The text is delivered as a literal — it is never interpreted by the
   * shell, so `$HOME`, backticks, quotes, and newlines are all safe. If Silo
   * cannot deliver it exactly, the launch is **refused** rather than mangled
   * or silently dropped: nothing is typed, no terminal is created, and
   * `launch()` returns the reason.
   *
   * Keep it to an opening instruction. The limit is **2 KiB** — about a page —
   * and anything longer is refused with `"too-large"`; see that member for
   * why the ceiling is where it is.
   *
   * The composed line is typed into the user's own interactive shell, so it
   * appears in scrollback and in shell history exactly as if they had typed
   * it. Don't put a secret in one.
   */
  prompt?: string;
  /**
   * Activate the target workspace and focus the new terminal. Defaults to
   * `true`. Pass `false` to start an agent without stealing the user's place.
   */
  activate?: boolean;
}

/**
 * What {@link AgentProfilesService.launch} did. A **result**, never a throw:
 * every foreseeable reason a launch cannot happen is a value you can branch
 * on and report to your own user.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export type LaunchAgentProfileResult =
  | {
      readonly ok: true;
      /** The created terminal's record id — the same id
       *  {@link AgentsService.getByTerminalId} and `ctx.terminals` take. */
      readonly terminalId: string;
    }
  | {
      readonly ok: false;
      /** Why nothing was launched. `"no-profile"` — the named profile does
       *  not exist, or there are no profiles at all. `"no-workspace"` — the
       *  named workspace does not exist, or none is open. Otherwise one of the
       *  {@link PromptRefusal} reasons. */
      readonly refusal: PromptRefusal | "no-profile" | "no-workspace";
    };

/**
 * Read the user's **Agent Profiles** and start one, optionally with an opening
 * prompt — exposed as `ctx.agents.profiles` (RFC 0033).
 *
 * A profile is a way to *start* a terminal, not a way to talk to an agent:
 * what comes up is a PTY running a real agent CLI, exactly as if the user had
 * typed the command themselves. There is no agent-agnostic messaging layer
 * here and there is not meant to be one.
 *
 * There is deliberately no `pick()` — build one from `list()` and
 * `ctx.ui.showMenu`, which is the shared chrome — and no `get()`, which is
 * `list().find()`.
 *
 * @example
 * ```ts
 * // Let the user choose a profile, then start it on a task.
 * const profiles = ctx.agents.profiles.list();
 * const chosen = await ctx.ui.showMenu(
 *   profiles.map((p) => ({ id: p.id, label: p.label })),
 * );
 * if (chosen) {
 *   const result = ctx.agents.profiles.launch({
 *     profileId: chosen,
 *     prompt: "Fix the failing test in src/foo.test.ts",
 *   });
 *   if (!result.ok) ctx.ui.notify("warn", `Couldn't start it: ${result.refusal}`);
 * }
 * ```
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentProfilesService {
  /**
   * Every Agent Profile the user has defined, in the order they appear in
   * Settings. The returned array is **read-only and deeply frozen**; it is
   * recomputed when the profile list changes, not on every call.
   */
  list(): readonly AgentProfileSummary[];
  /**
   * Start a profile in a terminal. Returns the created terminal's id, or a
   * typed refusal — see {@link LaunchAgentProfileResult}.
   *
   * A refused prompt creates nothing at all: no terminal record, no workspace
   * activation, no focus change.
   */
  launch(options?: LaunchAgentProfileOptions): LaunchAgentProfileResult;
}

/**
 * Host-computed coding-agent observability — exposed as
 * {@link ExtensionContext.agents}. Detection (what OSC/output signals mean
 * for a given agent) and resume-hint resolution are both sealed inside the
 * host implementation; there is no registration API. Mirrors
 * {@link ProcessesService} in shape: one shared, canonical answer, not
 * something each extension recomputes — reads are unscoped, and
 * {@link AgentsService.acknowledge} is the one deliberately scoped mutation,
 * the same pattern {@link ProcessesService.kill} establishes.
 *
 * @example
 * ```ts
 * const sub = ctx.agents.subscribe((agents) => {
 *   const dead = agents.find((a) => a.activity === "dead");
 *   if (dead) ctx.ui.notify("info", dead.resumeCommand ?? "An agent session ended.");
 * });
 * ctx.subscriptions.push(sub);
 * ```
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentsService {
  /**
   * Current {@link AgentInfo} for every tracked terminal in the active
   * workspace. Pass `{ allWorkspaces: true }` for every loaded workspace
   * instead.
   */
  getState(options?: { allWorkspaces?: boolean }): AgentInfo[];
  /** Look up {@link AgentInfo} for a specific terminal tab by its record id. */
  getByTerminalId(terminalId: string): AgentInfo | undefined;
  /**
   * Subscribe to changes in the active workspace's agent state. Pass
   * `{ allWorkspaces: true }` to be notified across every loaded workspace
   * instead. Returns a {@link Disposable} that cancels the subscription.
   */
  subscribe(
    listener: (state: AgentInfo[]) => void,
    options?: { allWorkspaces?: boolean },
  ): Disposable;
  /**
   * Acknowledge a finished run: clears {@link AgentInfo.needsAttention} (and
   * its `attentionSince` timestamp). A no-op if the terminal wasn't pending
   * attention. Doesn't touch `activity` — `"idle"` already correctly
   * describes the agent both before and after acknowledgment; only whether
   * a human has seen it changes.
   *
   * Deliberately **not** wired to focus automatically by the host — whether
   * *viewing* a terminal should count as acknowledging it is a per-consumer
   * policy call this method leaves to you, not a fixed rule `ctx.agents`
   * imposes. Call it from wherever your own UI decides a run has been seen —
   * typically `ctx.terminals.subscribeActive`, but it doesn't have to be.
   *
   * @example
   * ```ts
   * // Acknowledge whenever the user actually looks at the terminal.
   * ctx.subscriptions.push(
   *   ctx.terminals.subscribeActive((terminalId) => {
   *     if (terminalId) ctx.agents.acknowledge(terminalId);
   *   }),
   * );
   * ```
   */
  acknowledge(terminalId: string): void;
  /**
   * Every coding agent Silo knows about, as read-only
   * {@link CatalogAgentSummary} records. Detection stays sealed (ADR 0028) —
   * there is no way to register into this list.
   *
   * The returned array is **memoized and deeply frozen**: it is read inside
   * tab-icon rendering (`ctx.terminals.bindIcon`), so a fresh allocation per
   * call would be a per-render cost and a mutable one a correctness hazard.
   *
   * @category Consumer Services
   * @public
   */
  catalog(): readonly CatalogAgentSummary[];
  /**
   * The user's **Agent Profiles** — read them, and start one, optionally with
   * an opening prompt. See {@link AgentProfilesService}.
   *
   * @category Consumer Services
   * @public
   * @beta
   */
  readonly profiles: AgentProfilesService;
}
