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
 * (including plain, non-agent shells). `"dead"` is distinct from a merely
 * `stale` restored state — see {@link AgentInfo.stale} — and means the
 * terminal's backend was confirmed gone (no daemon to reattach to) after an
 * unclean shutdown; nothing will arrive to resolve this on its own.
 *
 * @category Core Types
 * @public
 * @beta
 */
export type AgentActivity =
  | "none"
  | "working"
  | "waiting"
  | "done"
  | "error"
  | "dead";

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
  /** Sticky "finished, go look" flag — cleared when the terminal is viewed. */
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
   * Resolved session identifier for the agent that was running, if one could
   * be determined. Only ever populated when `activity === "dead"`. Resolved
   * once, live, at the moment this terminal's agent was first detected —
   * not re-resolved at death time — so that concurrent sessions in the same
   * directory don't collide on a single after-the-fact lookup.
   */
  readonly sessionId?: string;
  /**
   * A ready-to-show (and copy/paste) resume command, e.g.
   * `"claude --resume 01abc..."` when a session id was resolved, or a
   * generic `"was running claude in ~/foo"`-style hint when it wasn't. Only
   * ever populated when `activity === "dead"`.
   */
  readonly resumeCommand?: string;
  /** Human-readable agent name, e.g. `"Claude Code"`. Only ever populated when `activity === "dead"`. */
  readonly agentName?: string;
}

/**
 * Host-computed, read-only coding-agent observability — exposed as
 * {@link ExtensionContext.agents}. Detection (what OSC/output signals mean
 * for a given agent) and resume-hint resolution are both sealed inside the
 * host implementation; there is no registration API. Mirrors
 * {@link ProcessesService} in shape: one shared, canonical answer, not
 * something each extension recomputes.
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
}
