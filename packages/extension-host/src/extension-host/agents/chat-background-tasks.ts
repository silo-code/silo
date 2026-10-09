/**
 * Reading **backgrounded shell work** off the inbound `session/update` stream —
 * the facts that let a Chat transcript stop claiming a backgrounded command
 * finished the instant it detached, and say when it actually did (RFC 0058).
 *
 * The sibling of `chat-delegated-work.ts`, and deliberately a separate module:
 * ADR 0056 settles **one quarantine per feature**, and a backgrounded shell is
 * a different feature from delegated agent work. They share a dependency (the
 * `claude` binary's shape, reachable only through this adapter) but not a
 * subject, and the two vendor surfaces here are not the two over there.
 *
 * The problem this exists for: a backgrounded `Bash` call reports
 * `status: "completed"` as soon as the command is handed off, while the command
 * runs on for minutes — so `sleep 30` read as finished at second one. The
 * adapter's own source says why there is no better status to send:
 *
 * > ACP has no tool-call status for "still running elsewhere", so this marker is
 * > what lets a client render the card as backgrounded work instead of finished
 * > work.
 *
 * **Two vendor surfaces, one capability.** Both reads below are gated on Silo
 * advertising AIR `asyncTasks` (`AIR_CLIENT_META` in `acp-jsonrpc.ts`), and the
 * adapter will send *neither* without it — the marker is withheld precisely
 * because a client that is not sent the lifecycle could never resolve the card
 * state the marker promises. So this module and that advertisement are one
 * change; neither is useful alone.
 *
 * **What makes this different from delegated work, and better.** The subagent
 * stream has no finish signal at all, which is why RFC 0055 could only ever
 * count dispatches. Here `async_task_state_update` reports a **terminal state
 * per task**, identified by `asyncTaskId` — so a row resolves and a count comes
 * down. That is the whole reason the capability is worth advertising.
 *
 * Everything here is pure and wire-shaped — one frame in, meaning out, no state
 * — the same shape as `chat-delegated-work.ts` and `chat-turn-signals.ts`
 * beside it. Accumulating facts spread across frames is the reducer's job:
 * `async_task_spawned` carries the `name` and no `toolCallId`, while the
 * correlation arrives on a later frame, so no single frame tells the whole
 * story.
 *
 * Every read is guarded and **degrades to absence**: an unrecognised shape
 * yields `undefined`, which is byte-for-byte the rendering before this change.
 * The degradation path is the error path.
 */

/**
 * Where a backgrounded task is in its life, in the adapter's own spelling
 * (`AsyncTaskState` in `acp-subagents.d.ts`).
 *
 * `"running"` and `"paused"` are live; the other three are terminal. A value
 * outside this set yields no event at all — guessing what an unknown state
 * means is how a transcript starts lying.
 */
export type BackgroundTaskState =
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "stopped";

const STATES = new Set<string>([
  "running",
  "paused",
  "completed",
  "failed",
  "stopped",
]);

/** The three terminal states. Exported because the reducer's "last terminal
 *  wins" rule needs the same answer this module gives. */
const TERMINAL = new Set<string>(["completed", "failed", "stopped"]);

/** Whether a state means the task is over. */
export function isTerminalBackgroundTaskState(
  state: BackgroundTaskState,
): boolean {
  return TERMINAL.has(state);
}

/**
 * One frame's worth of news about a backgrounded task.
 *
 * {@link asyncTaskId} is the **primary key** and the only field always present.
 * Everything else is what *this* frame happened to carry, omitted rather than
 * defaulted when it did not — so a consumer can tell "this frame said nothing
 * about it" from "this frame said no".
 */
export interface BackgroundTaskEvent {
  /** The task this event is about — stable for the task's whole life. */
  readonly asyncTaskId: string;
  /**
   * The task's state, **when this frame reported one**.
   *
   * Absent on `async_task_progress`, and that is load-bearing rather than
   * incidental: a progress frame says "here is some metadata", not "it is
   * running". Were it to assert `"running"`, a progress frame arriving after a
   * terminal edge would **resurrect a finished task** — the adapter keeps
   * terminal tombstones and publishes from them, so that ordering is reachable,
   * not hypothetical.
   */
  readonly state?: BackgroundTaskState;
  /**
   * The tool call this task belongs to — the join that puts the lifecycle on
   * the right `Bash` row.
   *
   * **Learned, not given.** `async_task_spawned` carries no `toolCallId` in the
   * 2026-10-07 capture; it first arrives on the `async_task_progress` 1ms
   * later, and the adapter's own type calls it "Originating tool call, when
   * correlation becomes known after spawn". A consumer keyed on this field
   * alone therefore drops the spawn — and with it the `name`, `taskType` and
   * `canStop` that only the spawn carries.
   */
  readonly toolCallId?: string;
  /** Human-readable label, e.g. `"Sleep for 30 seconds"`. **Spawn-only** —
   *  accumulate it rather than expecting it on the terminal event. */
  readonly name?: string;
  /** The adapter's coarse category for the task, e.g. `"shell"`. Spawn-only,
   *  same accumulation caveat as {@link name}. */
  readonly taskType?: string;
  /** Whether the agent will honour a stop request for this task. Spawn-only.
   *  Carried through now because it is the fact a stop control would key on;
   *  nothing renders it yet. */
  readonly canStop?: boolean;
  /** The agent's own closing summary, when it sent one with a terminal state. */
  readonly summary?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Read the **backgrounded-task lifecycle** off one `session/update` frame — the
 * AIR `asyncTasks` extension's `async_task_spawned`, `async_task_progress` and
 * `async_task_state_update`.
 *
 * All three kinds are read, not just the terminal one, because the three carry
 * different pieces of one task: the spawn names it, a progress frame correlates
 * it to its tool call, and the state update ends it. Dropping the spawn to
 * simplify would lose the only frame that says what the command *was*.
 *
 * Read regardless of which session the frame arrived on, as
 * {@link delegationEvent} is: the adapter publishes this lifecycle from a
 * runtime constructed once per `session/new`, so a shell backgrounded inside a
 * subagent reports on the **root** session while its tool call sits in the
 * child's. Filtering by session here would silently drop that case.
 *
 * Pure and total: an unrecognised kind, a missing `asyncTaskId`, or a `state`
 * outside {@link BackgroundTaskState} yields `undefined` rather than a guess or
 * a throw.
 *
 * @param update The whole `session/update` payload.
 */
export function backgroundTaskEvent(
  update: unknown,
): BackgroundTaskEvent | undefined {
  if (!isRecord(update)) return undefined;
  const kind = update.sessionUpdate;
  if (
    kind !== "async_task_spawned" &&
    kind !== "async_task_progress" &&
    kind !== "async_task_state_update"
  ) {
    return undefined;
  }

  const asyncTaskId = str(update.asyncTaskId);
  if (asyncTaskId === undefined) return undefined;

  const toolCallId = str(update.toolCallId);
  const summary = str(update.summary);

  if (kind === "async_task_spawned") {
    // `name` and `description` are the same string in the capture; prefer
    // `name` and fall back, rather than picking one and being nameless when
    // the adapter sends only the other.
    const name = str(update.name) ?? str(update.description);
    const taskType = str(update.taskType);
    const canStop = update.canStop === true ? true : undefined;
    return {
      asyncTaskId,
      // A spawn is genuine state news: the task has started. This is the one
      // non-`async_task_state_update` frame that may assert a state, because
      // it cannot arrive after a terminal edge — there is one spawn per task.
      state: "running",
      ...(toolCallId !== undefined ? { toolCallId } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(taskType !== undefined ? { taskType } : {}),
      ...(canStop !== undefined ? { canStop } : {}),
      ...(summary !== undefined ? { summary } : {}),
    };
  }

  if (kind === "async_task_progress") {
    // Metadata only — deliberately no `state`. See `BackgroundTaskEvent.state`.
    if (toolCallId === undefined && summary === undefined) {
      // Nothing this consumer can use. The adapter does send such frames
      // (progress with only an `outputFilePath`, which is not exposed), and an
      // event carrying only an id would make the reducer do pointless work.
      return undefined;
    }
    return {
      asyncTaskId,
      ...(toolCallId !== undefined ? { toolCallId } : {}),
      ...(summary !== undefined ? { summary } : {}),
    };
  }

  const state = update.state;
  if (typeof state !== "string" || !STATES.has(state)) return undefined;
  return {
    asyncTaskId,
    state: state as BackgroundTaskState,
    ...(toolCallId !== undefined ? { toolCallId } : {}),
    ...(summary !== undefined ? { summary } : {}),
  };
}

/**
 * Whether this `tool_call` / `tool_call_update` frame says its command
 * **detached into the background**, so the status it reports is about the
 * hand-off and not about the work.
 *
 * Reads `_meta.jetbrains.air.asyncTasks.backgrounded`. Note the namespace: AIR,
 * not `claudeCode`. The adapter chose that deliberately — the marker is stamped
 * only for a client that advertised `asyncTasks`, because to a client that did
 * not, and which therefore never receives the lifecycle above, the marker would
 * promise a card state it could never resolve.
 *
 * `=== true` and nothing weaker: a marker present but not `true` reads as
 * absent rather than being falsy-coerced into a claim either way. Returns
 * `undefined` rather than `false` for the same reason every other fact in these
 * quarantines is omitted when unsaid — the reducer accumulates across frames,
 * and the marker rides only the frame the tool result emits, so "this frame
 * didn't say" must not overwrite "an earlier frame did".
 *
 * @param update The whole `session/update` payload — `_meta` sits on the update
 * envelope, not nested under a `toolCall` object.
 */
export function backgroundedToolCallFact(update: unknown): true | undefined {
  if (!isRecord(update)) return undefined;
  const meta = update._meta;
  if (!isRecord(meta)) return undefined;
  const jetbrains = meta.jetbrains;
  if (!isRecord(jetbrains)) return undefined;
  const air = jetbrains.air;
  if (!isRecord(air)) return undefined;
  const asyncTasks = air.asyncTasks;
  if (!isRecord(asyncTasks)) return undefined;
  return asyncTasks.backgrounded === true ? true : undefined;
}
