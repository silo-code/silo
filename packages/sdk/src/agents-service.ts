import type { Disposable } from "./types";
import type { TerminalKind } from "./domain-types";

// `ctx.agents` — host-computed coding-agent activity and resume-identity
// observability. See RFC 0017 (docs/proposals/0017-ctx-agents-surface.md).
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
  /** The terminal's kind at registration time (`"shell"`, `"claude"`, `"pi"`). */
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
}
