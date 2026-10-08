/**
 * Reading **delegated work** off the inbound `session/update` stream — the
 * facts that let a Chat transcript stop claiming a subagent dispatch finished
 * when it only handed its work off (RFC 0055), and say when the delegated work
 * actually did finish (RFC 0057).
 *
 * Two vendor surfaces, one quarantine. {@link delegatedWorkFacts} reads
 * `_meta.claudeCode` off a tool-call frame; {@link delegationEvent} reads the
 * **AIR subagent lifecycle** kinds (`subagent_spawned`,
 * `subagent_state_update`) that Silo opts into by advertising
 * `nativeSubagentSessions`. They live together because they are the same
 * dependency wearing two hats — the `claude` binary's own shape, reachable
 * only through this adapter — and because the canonical `subagent_update` that
 * eventually replaces the AIR pair should land here and nowhere else.
 *
 * The problem this exists for: when a Claude Code agent dispatches a subagent,
 * the dispatching tool call reports `status: "completed"` about 0.4s after the
 * hand-off, while the subagent is still working. Silo rendered that status, so
 * a session with minutes of delegated work left read as finished. The hand-off
 * is on the wire — it is just in `_meta`, which `parseToolCall` deliberately
 * drops.
 *
 * **This module is the vendor quarantine** (ADR 0056). It is the one place
 * `_meta.claudeCode` is read for delegated work, and nothing outside it —
 * least of all the Chat panel — may reach into `_meta` for these facts.
 * `parseToolCall` (`acp-update-model.ts`) calls it and spreads the result onto
 * the modelled `AgentToolCall`, per RFC 0038 phase 3.8's rule that everything
 * a Chat UI must draw is a modelled field.
 *
 * **The fields it reads are versioned by nothing.** `isAsync`,
 * `async_launched` and `parentToolUseId` appear nowhere in the pinned
 * adapter's own source — `claude-agent-acp` 0.75.1 types `toolResponse?:
 * unknown` and forwards the CLI's internal tool-result JSON verbatim. This is
 * therefore a dependency on the `claude` binary's shape, less stable than an
 * adapter contract and the least stable surface in the feature. So every read
 * below is guarded and **degrades to absence**: an unrecognised shape yields
 * all three facts omitted, which is byte-for-byte today's rendering. The
 * degradation path is the error path.
 *
 * Everything here is pure and wire-shaped — one frame in, meaning out, no
 * state — the same shape as `chat-turn-signals.ts` beside it. The
 * accumulation of facts spread across several frames on one call id is the
 * transcript reducer's job, not this module's.
 */

/**
 * The delegated-work markers carried by one tool-call frame. Each is a
 * **durable fact about that frame**, not a liveness signal: see
 * {@link delegatedWorkFacts}.
 */
export interface DelegatedWorkFacts {
  /** This call dispatched a subagent. */
  readonly subagent?: boolean;
  /** The call handed its work off to run elsewhere, so whatever status it
   *  reports describes the dispatch and not the work. */
  readonly handedOff?: boolean;
  /** The id of the dispatching call this one was made on behalf of. */
  readonly parentToolCallId?: string;
  /** The delegated worker this call dispatched — the id that joins this row to
   *  the child session whose frames render under it. */
  readonly subagentId?: string;
  /** A title the vendor supplied for the dispatch, for the capability-on
   *  regime where the frame carries no `title` of its own. */
  readonly title?: string;
}

/** No facts at all — the result for every shape this module does not
 *  recognise, shared so the common path allocates nothing. */
const NONE: DelegatedWorkFacts = {};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Strip the vendor's `:generation:N` suffix off a subagent id, so every
 * arrival of the same subagent carries the same identity.
 *
 * **Why this exists.** The capture of 2026-10-07 shows the lifecycle pair
 * arriving *twice* for one subagent: `subagent_spawned` /
 * `subagent_state_update` on `a26fef4c40ae0ac1d`, then the same pair again on
 * `a26fef4c40ae0ac1d:generation:2` when the backgrounded shell it was waiting
 * on reported in. A consumer pairing spawn-to-terminal naively would count one
 * subagent as two and never reach zero outstanding.
 *
 * Normalising **at parse time** is what makes "arrives twice" a non-issue
 * everywhere else: the consumer then only needs last-write-wins on state, with
 * no dedupe bookkeeping of its own. The un-normalised wire id stays readable in
 * `AgentSessionUpdate.raw` for anyone who wants the generation back.
 *
 * Note the **child session id is the un-suffixed form** — the capture's child
 * frames arrive on `a26fef4c40ae0ac1d`, never on a generation-suffixed id — so
 * normalising also makes the id that joins a dispatch row to its child session
 * the same string in both places.
 */
export function normalizeSubagentId(id: string): string {
  const at = id.indexOf(":generation:");
  return at === -1 ? id : id.slice(0, at);
}

/** The subagent lifecycle states the AIR extension reports, mapped from the
 *  wire's own spelling. A value outside this set yields no event at all —
 *  guessing what an unknown state means is how a transcript starts lying. */
const TERMINAL_STATES = new Set([
  "completed",
  "failed",
  "cancelled",
  "disconnected",
]);

/**
 * The subagent lifecycle, read off one frame. `state: "started"` is
 * {@link DelegationEvent}'s reading of `subagent_spawned`; every other value
 * came from a `subagent_state_update` and is terminal.
 */
export interface DelegationEvent {
  readonly subagentId: string;
  readonly name?: string;
  readonly task?: string;
  readonly state:
    | "started"
    | "completed"
    | "failed"
    | "cancelled"
    | "disconnected";
}

/**
 * Read the **subagent lifecycle** off one `session/update` frame — the AIR
 * extension's `subagent_spawned` and `subagent_state_update`.
 *
 * This is the signal RFC 0055 could not have: an *identified* terminal state
 * per delegated worker, arriving whenever the work actually ends — the capture
 * has one landing 25s after the parent's turn was already over. It is what
 * turns "N agents dispatched" into a count that comes down.
 *
 * Both kinds arrive on the **parent's** session id, not the child's, so this
 * is read regardless of which session a frame came in on.
 *
 * Pure and total like everything else here: an unrecognised kind, a missing
 * id, or a `state` outside the closed set above yields `undefined` rather than
 * a guess or a throw. Absence degrades to RFC 0055's rendering — a dispatch
 * row that says "handed off" and nothing more.
 *
 * @param update The whole `session/update` payload.
 */
export function delegationEvent(update: unknown): DelegationEvent | undefined {
  if (!isRecord(update)) return undefined;
  const kind = update.sessionUpdate;
  if (kind !== "subagent_spawned" && kind !== "subagent_state_update")
    return undefined;

  const rawId = update.subagentSessionId;
  if (typeof rawId !== "string" || rawId.length === 0) return undefined;
  const subagentId = normalizeSubagentId(rawId);
  if (subagentId.length === 0) return undefined;

  if (kind === "subagent_spawned") {
    const name = typeof update.name === "string" ? update.name : undefined;
    const task = typeof update.task === "string" ? update.task : undefined;
    return {
      subagentId,
      ...(name !== undefined ? { name } : {}),
      ...(task !== undefined ? { task } : {}),
      state: "started",
    };
  }

  const state = update.state;
  if (typeof state !== "string" || !TERMINAL_STATES.has(state))
    return undefined;
  return { subagentId, state: state as DelegationEvent["state"] };
}

/**
 * Read the vendor's delegated-work markers off one `tool_call` /
 * `tool_call_update` frame.
 *
 * The frames the capture of 2026-10-06 actually carried, spread across one
 * call id — which is why no single frame tells the whole story and why every
 * fact is independently optional:
 *
 * | Frame | `status`   | `_meta.claudeCode`                                        |
 * | ----- | ---------- | --------------------------------------------------------- |
 * | 12    | `pending`  | `{toolName: "Agent", subagent: true}`                     |
 * | 13–16 | *absent*   | `{toolName: "Agent", subagent: true}`                     |
 * | 19    | *absent*   | `{toolResponse: {isAsync: true, status: "async_launched"}}`|
 * | 20    | `completed`| `{toolName: "Agent"}`                                     |
 *
 * A field the wire did not carry is **omitted, never defaulted**, so a
 * consumer can tell "this frame said nothing" from "this frame said no" — the
 * same rule `parseToolCall` applies to every other field. Returns an empty
 * object, never throws, for any input: a missing `_meta`, a non-object
 * `_meta.claudeCode`, or a `toolResponse` that is a string, an array or
 * `null`.
 *
 * Liveness is deliberately **not** among the facts. It is derived state that
 * changes over time, and a transcript row is history.
 *
 * @param update The whole `session/update` payload — `_meta` sits on the
 * update envelope, not nested under a `toolCall` object.
 */
export function delegatedWorkFacts(update: unknown): DelegatedWorkFacts {
  if (!isRecord(update)) return NONE;
  const meta = update._meta;
  if (!isRecord(meta)) return NONE;
  const claudeCode = meta.claudeCode;
  if (!isRecord(claudeCode)) return NONE;

  const response = claudeCode.toolResponse;

  // The capability-on regime drops the explicit marker. With AIR
  // `nativeSubagentSessions` advertised the capture shows no opening
  // `tool_call` for the dispatch at all and no `_meta.claudeCode.subagent` —
  // the dispatch arrives as a lone `tool_call_update` whose `toolResponse`
  // names the worker it handed to. So the id is the second source for the
  // same fact: *a call that names the worker it delegated to is a dispatch.*
  const agentId = isRecord(response) ? response.agentId : undefined;
  const subagentId =
    typeof agentId === "string" && agentId.length > 0
      ? normalizeSubagentId(agentId)
      : undefined;

  // `=== true` and nothing weaker: a marker present but not `true` is treated
  // as absent rather than falsy-coerced into a claim either way.
  const subagent =
    claudeCode.subagent === true || subagentId !== undefined ? true : undefined;

  // Either signal alone is enough. The capture carries both, but requiring
  // both would let one adapter tweak silently disable the whole fix — and the
  // cost of reading one is a row that says "handed off" for a call that was,
  // which is the truthful side to err on.
  const handedOff =
    isRecord(response) &&
    (response.isAsync === true || response.status === "async_launched")
      ? true
      : undefined;

  const parent = claudeCode.parentToolUseId;
  const parentToolCallId =
    typeof parent === "string" && parent.length > 0 ? parent : undefined;

  // The dispatch's own label, for the same reason: the capability-on frame
  // carries no `title`, so a row sourced from it alone would be nameless.
  // `parseToolCall` prefers the frame's real `title` over this one.
  const description = isRecord(response) ? response.description : undefined;
  const title =
    typeof description === "string" && description.length > 0
      ? description
      : undefined;

  if (
    subagent === undefined &&
    handedOff === undefined &&
    parentToolCallId === undefined &&
    subagentId === undefined &&
    title === undefined
  ) {
    return NONE;
  }
  return {
    ...(subagent !== undefined ? { subagent } : {}),
    ...(handedOff !== undefined ? { handedOff } : {}),
    ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
    ...(subagentId !== undefined ? { subagentId } : {}),
    ...(title !== undefined ? { title } : {}),
  };
}
