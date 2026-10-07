/**
 * Reading **delegated work** off the inbound `session/update` stream — the
 * three facts that let a Chat transcript stop claiming a subagent dispatch
 * finished when it only handed its work off (RFC 0055).
 *
 * The problem this exists for: when a Claude Code agent dispatches a subagent,
 * the dispatching tool call reports `status: "completed"` about 0.4s after the
 * hand-off, while the subagent is still working. Silo rendered that status, so
 * a session with minutes of delegated work left read as finished. The hand-off
 * is on the wire — it is just in `_meta`, which `parseToolCall` deliberately
 * drops.
 *
 * **This module is the vendor quarantine.** It is the one place
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
}

/** No facts at all — the result for every shape this module does not
 *  recognise, shared so the common path allocates nothing. */
const NONE: DelegatedWorkFacts = {};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
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

  // `=== true` and nothing weaker: a marker present but not `true` is treated
  // as absent rather than falsy-coerced into a claim either way.
  const subagent = claudeCode.subagent === true ? true : undefined;

  // Either signal alone is enough. The capture carries both, but requiring
  // both would let one adapter tweak silently disable the whole fix — and the
  // cost of reading one is a row that says "handed off" for a call that was,
  // which is the truthful side to err on.
  const response = claudeCode.toolResponse;
  const handedOff =
    isRecord(response) &&
    (response.isAsync === true || response.status === "async_launched")
      ? true
      : undefined;

  const parent = claudeCode.parentToolUseId;
  const parentToolCallId =
    typeof parent === "string" && parent.length > 0 ? parent : undefined;

  if (
    subagent === undefined &&
    handedOff === undefined &&
    parentToolCallId === undefined
  ) {
    return NONE;
  }
  return {
    ...(subagent !== undefined ? { subagent } : {}),
    ...(handedOff !== undefined ? { handedOff } : {}),
    ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
  };
}
