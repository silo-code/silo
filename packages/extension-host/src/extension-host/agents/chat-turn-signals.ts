/**
 * Reading turn boundaries off the inbound `session/update` stream — the
 * ambiguity a Chat session has to resolve before it can call the shared turn
 * core (`agent-turn-model.ts`), exactly as the terminal reducer resolves
 * detection ambiguity before calling the same functions.
 *
 * The problem this exists for: ACP only reports a `stopReason` as the
 * **response to `session/prompt`**, so a turn the host asked for has a clean
 * start and end. An **agent-initiated turn** — one the agent begins on its own,
 * with no prompt from Silo — has neither. They are routine, not exotic: Claude
 * Code's harness re-invokes the agent in-process whenever a background task
 * notifies (a monitor firing, an async subagent finishing), and the adapter
 * streams that whole turn at the client as ordinary `session/update`
 * notifications. Before this module the host never learned such a turn was
 * running, so the tab kept the "Finished" badge from the last turn the user had
 * actually sent while its transcript filled underneath.
 *
 * Everything here is pure and wire-shaped: it reads one update and says what it
 * means. The state machine lives in `acp-sessions-service.ts`.
 */
import type { AcpSessionUpdate } from "./acp-jsonrpc";

/**
 * Updates that mean *the agent is doing something*.
 *
 * An allow-list, not a deny-list, and deliberately so. The cost of omitting a
 * kind is one missed turn-start; the cost of wrongly including one is a turn
 * that reopens forever, because the metadata an agent emits **at turn-over**
 * would re-promote the session the instant the host demoted it. That asymmetry
 * is not hypothetical — `claude-agent-acp` regenerates the conversation title
 * from its `onTurnEnd` hook, so `session_info_update` lands immediately after
 * every turn ends (observed on the wire 2026-10-06).
 *
 * The excluded kinds are all genuinely *about* the session rather than work in
 * it: `usage_update` (a running meter), `session_info_update` (the title),
 * `available_commands_update` / `current_mode_update` / `config_option_update`
 * (live snapshots of what the agent currently offers).
 */
const WORK_UPDATES: ReadonlySet<string> = new Set([
  "user_message_chunk",
  "agent_message_chunk",
  "agent_thought_chunk",
  "tool_call",
  "tool_call_update",
  "plan",
]);

export function isWorkUpdate(update: AcpSessionUpdate): boolean {
  return WORK_UPDATES.has(update.sessionUpdate);
}

/**
 * Who started the turn this update ends. `"human"` is a turn the host prompted;
 * every other provenance the agent reports (`"task-notification"` today) is an
 * agent-initiated one.
 */
export type TurnOrigin = "human" | "agent";

/**
 * The end of a turn, when the agent says so outright.
 */
export interface TurnEndMarker {
  /**
   * Who started the turn, when the agent says. `undefined` for a frame that
   * marks the boundary but carries no provenance — see {@link turnEndMarker}.
   * Purely diagnostic: the service decides whose turn is ending from whether
   * it has a `session/prompt` in flight, never from this.
   */
  readonly origin: TurnOrigin | undefined;
}

/**
 * Read a turn-end marker off one update, or `undefined` when it isn't one.
 *
 * `claude-agent-acp` stamps exactly one `usage_update` per turn with a `cost`,
 * and that frame lands last. It is an authoritative boundary the protocol
 * itself does not offer — ACP's own `stopReason` only ever answers a
 * `session/prompt`, so a turn the agent starts on its own has no end of its own.
 *
 * **The boundary is the `cost`, not the origin.** This originally keyed on
 * `_meta["_claude/origin"]`, from a 2026-10-06 measurement over 7 sessions /
 * 12 turns that found "never a `cost` without an origin". That sample was all
 * host-prompted turns, and the claim is false: on `claude-agent-acp@0.75.1`
 * an **agent-initiated** turn routinely ends with a cost-bearing `usage_update`
 * carrying no `_meta` at all. Re-measured 2026-10-20 over 120 production
 * journals (1673 cost-bearing frames):
 *
 * - 14 carried a `cost` with no origin — every one of them the last frame of a
 *   stranded turn.
 * - **0** carried an origin with no `cost`. Origin is a strict subset, so
 *   keying on `cost` loses nothing and catches those 14.
 * - Both land at the same point in the stream (~19.5% of each arrive while a
 *   subagent's tool call is open), so `cost` is no more mid-turn than the
 *   marker this replaces.
 *
 * That one wrong invariant wedged a production tab in "Working" with no way
 * out, because the service had retired its quiescence fallback on the strength
 * of it. The fallback no longer retires either — see {@link TURN_BACKSTOP_MS}.
 *
 * Vendor-namespaced on purpose, and quarantined here: the shared turn core and
 * the service's state machine never name an agent. An agent that sends no such
 * marker simply has none, and the service falls back to quiescence —
 * see {@link TURN_QUIESCENCE_MS}.
 */
export function turnEndMarker(
  update: AcpSessionUpdate,
): TurnEndMarker | undefined {
  if (update.sessionUpdate !== "usage_update") return undefined;
  const origin = readOrigin(update._meta);
  if (origin) return { origin };
  return hasCost(update) ? { origin: undefined } : undefined;
}

function readOrigin(meta: unknown): TurnOrigin | undefined {
  const kind = asRecord(asRecord(meta)["_claude/origin"]).kind;
  if (typeof kind !== "string") return undefined;
  return kind === "human" ? "human" : "agent";
}

/**
 * A `cost` reading, which the adapter attaches once per turn. Shape-checked
 * rather than trusted: a mid-turn `usage_update` has no `cost` key at all, so
 * anything that is an object here is the per-turn stamp.
 */
function hasCost(update: AcpSessionUpdate): boolean {
  const cost = update.cost;
  return typeof cost === "object" && cost !== null && !Array.isArray(cost);
}

/**
 * How a tool call's in-flight state changed, or `undefined` when this update
 * says nothing about it.
 *
 * The non-obvious part, and a thing worth not rediscovering: **intermediate
 * `tool_call_update` frames carry no `status` at all**. The observed shape for
 * one call is `tool_call{status:"pending"}`, then several `tool_call_update`
 * frames with only a title or content, then a final
 * `tool_call_update{status:"completed"}`. Tracking flight by "whatever the last
 * update said" would therefore clear a live call on its first content frame.
 * Absent status means "no news" — hence `undefined` rather than a boolean.
 */
export interface ToolCallFlight {
  readonly toolCallId: string;
  /** `true` once the call is running, `false` once it has settled. */
  readonly inFlight: boolean;
}

const SETTLED_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export function toolCallFlight(
  update: AcpSessionUpdate,
): ToolCallFlight | undefined {
  if (
    update.sessionUpdate !== "tool_call" &&
    update.sessionUpdate !== "tool_call_update"
  ) {
    return undefined;
  }
  const toolCallId = update.toolCallId;
  if (typeof toolCallId !== "string" || toolCallId === "") return undefined;
  const status = update.status;
  if (typeof status !== "string") {
    // No news. A bare `tool_call` with no status is still a call starting;
    // a bare `tool_call_update` says nothing either way.
    return update.sessionUpdate === "tool_call"
      ? { toolCallId, inFlight: true }
      : undefined;
  }
  return { toolCallId, inFlight: !SETTLED_STATUSES.has(status) };
}

/**
 * How long an agent-initiated turn may go quiet before the host calls it over.
 *
 * The window for an agent that reports no {@link turnEndMarker} at all. It is
 * the Chat analogue of the terminal path's {@link
 * import("./agent-detection-dispatch").SHELL_IDLE_MS} fallback, which exists
 * for the same reason: some agents never say "done", and silence is the only
 * signal left.
 *
 * Longer than that 3s because the unit here is a whole turn, not a shell zone:
 * a model composing its next tool call goes quiet for seconds at a time. Tool
 * calls are excluded from the clock entirely rather than padded for — a call
 * still in flight means the turn is definitionally not over, however long it
 * runs. That matters: the turn that prompted this work ran a test suite for
 * over a minute with nothing on the wire.
 */
export const TURN_QUIESCENCE_MS = 15_000;

/**
 * The same fallback, widened, for an agent that **does** mark its turn ends.
 *
 * This used to be `Infinity` in all but name: the first {@link turnEndMarker}
 * a session saw retired the quiescence clock for good, on the reasoning that a
 * marker is authoritative and a timer could only end a turn early. That holds
 * right up until a marker goes missing, and then there is nothing left at all —
 * which is exactly how a production tab sat in "Working" for 33 minutes after
 * its agent had plainly finished talking.
 *
 * So the clock never retires; a known-marking agent just gets a far longer
 * leash, long enough that it only ever fires when a marker is genuinely absent.
 * The asymmetry that made retiring it look safe runs the other way once you
 * price both failures honestly, and only for the turns this can reach — an
 * **agent-initiated** one, never a `session/prompt` turn, which is owned by its
 * own promise and never arms this clock:
 *
 * - **Fires early** → the tab reads "Finished" while a background turn is still
 *   thinking. Self-correcting: the next work update reopens the turn
 *   (`noteAgentActivity`), and a tool call in flight holds it open for as long
 *   as it runs, however many windows that spans.
 * - **Never fires** → the tab is wedged in "Working" until the process dies.
 *   Nothing short of a reload clears it.
 */
export const TURN_BACKSTOP_MS = 120_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
