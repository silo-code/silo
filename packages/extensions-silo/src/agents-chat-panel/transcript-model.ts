/**
 * The Chat panel's projection of the `ctx.agents.sessions` update stream into
 * a renderable transcript (RFC 0038 phase 3).
 *
 * Deliberately a **pure reducer over the SDK's `AgentSessionUpdate`** and
 * nothing else — no host imports, no protocol client, no React. That is the
 * point of the phase: if this file can turn the SDK's stream into a
 * transcript, so can a third-party extension's. It is also the panel's only
 * real logic, which is why it lives here rather than inline in the component
 * (`.agents/skills/silo-testing/SKILL.md`).
 *
 * Two rules govern everything below:
 *
 * - **Tolerate unknown `kind`s.** Agents emit different subsets and vendors
 *   add their own; anything not projected here is dropped, never an error.
 * - **Never read `update.raw`.** Every field this panel renders is a modelled
 *   one (RFC 0038 phase 3.8) — `update.toolCall`, `update.plan`,
 *   `update.text`. That is the proof the surface is complete: a third-party
 *   Chat UI can draw a transcript without knowing the Agent Client Protocol's
 *   wire shapes, because the reference implementation doesn't either. If this
 *   file ever needs `raw` back, the SDK has a gap.
 *
 * Fields still arrive **optional**, because the wire is: a `tool_call_update`
 * carries only what changed, so "absent" means "unchanged", not "now empty".
 */

import type {
  AgentPlanEntry,
  AgentSessionUpdate,
  AgentToolCall,
  AgentToolCallContent,
} from "@silo-code/sdk";
import { resolveToolDiffs, type ToolDiff } from "./tool-diff";

/** Which speaker a {@link MessageEntry} came from. `"thought"` is the agent
 *  thinking out loud (`agent_thought_chunk`), rendered as an aside. */
export type TranscriptRole = "user" | "agent" | "thought";

/** A run of streamed text from one speaker, grouped by `messageId`. */
export interface MessageEntry {
  readonly type: "message";
  readonly key: string;
  readonly role: TranscriptRole;
  /** The `messageId` this run was grouped by, when the stream carried one. */
  readonly messageId?: string;
  readonly text: string;
  /** File names the user attached to this turn (`role === "user"` only) —
   *  rendered as chips under the message. */
  readonly attachments?: readonly string[];
}

/** One tool call, updated in place as `tool_call_update`s arrive. */
export interface ToolEntry {
  readonly type: "tool";
  readonly key: string;
  readonly toolCallId: string;
  readonly title: string;
  /** Protocol status — `"pending"`, `"in_progress"`, `"completed"`,
   *  `"failed"`, or something a vendor invented. Never switch exhaustively. */
  readonly status: string;
  /** The protocol's coarse tool category (`"read"`, `"edit"`, `"execute"`, …),
   *  when it gave one. */
  readonly toolKind?: string;
  /** Human-readable lines pulled out of the call's content blocks — the
   *  tool's **output**. */
  readonly lines: readonly string[];
  /** Structured file edits, when the call carried a protocol `"diff"` or
   *  an Edit-shaped `rawInput`. Rendered as a hunk in the expanded row. */
  readonly diffs?: readonly ToolDiff[];
  /** The arguments the agent passed to its own tool (`AgentToolCall.rawInput`)
   *  — the tool's **input**, shown as its own section when the row is
   *  expanded. Vendor-shaped and typed `unknown` by the SDK itself (the
   *  protocol places no schema on it); {@link formatToolInput} is the one
   *  place this panel narrows it, for display only. Carrying this through is
   *  reading a modelled `AgentToolCall` field, not the wire's `raw` escape
   *  hatch this file otherwise refuses. */
  readonly rawInput?: unknown;
}

/** One row of the agent's plan. */
export interface PlanRow {
  readonly content: string;
  readonly status: string;
  readonly priority?: string;
}

/** The agent's current plan. Reissued in full by the agent, so it is replaced
 *  in place rather than appended — there is one plan, not a history of them. */
export interface PlanEntry {
  readonly type: "plan";
  readonly key: string;
  readonly rows: readonly PlanRow[];
}

/** A line of Silo's own commentary in the flow of the transcript — a stop
 *  reason worth reporting, a connection that dropped. Never from the agent. */
export interface NoticeEntry {
  readonly type: "notice";
  readonly key: string;
  readonly tone: "info" | "warn" | "error";
  readonly text: string;
}

export type TranscriptEntry =
  | MessageEntry
  | ToolEntry
  | PlanEntry
  | NoticeEntry;

/**
 * The reduced transcript. `seq` is the key counter — carried in the state so
 * the reducer stays pure and every entry gets a React key that is stable
 * across re-renders and unique even for two consecutive anonymous runs.
 */
export interface Transcript {
  readonly entries: readonly TranscriptEntry[];
  readonly seq: number;
}

export const emptyTranscript: Transcript = { entries: [], seq: 0 };

/** Chunk kinds that stream text, mapped to the speaker they belong to. */
const CHUNK_ROLES: Record<string, TranscriptRole> = {
  agent_message_chunk: "agent",
  agent_thought_chunk: "thought",
  user_message_chunk: "user",
};

function nonEmpty(v: string | undefined): string | undefined {
  return v !== undefined && v.length > 0 ? v : undefined;
}

/**
 * Flatten a tool call's content blocks into display lines.
 *
 * The protocol wraps each in a `{ type }` envelope: `"content"` holds a
 * content block (usually text), `"diff"` describes a file edit, `"terminal"`
 * points at a terminal Silo declined to provide. Anything else is named but
 * not expanded — better an honest `[image]` row than a silently empty call.
 */
export function toolContentLines(
  content: readonly AgentToolCallContent[] | undefined,
): string[] {
  if (!content) return [];
  const lines: string[] = [];
  for (const block of content) {
    if (block.type === "content") {
      const inner = block.content;
      if (!inner) continue;
      const text = nonEmpty(inner.text);
      lines.push(text ?? `[${nonEmpty(inner.type) ?? "content"}]`);
      continue;
    }
    if (block.type === "diff") {
      lines.push(`diff ${nonEmpty(block.path) ?? "(unnamed file)"}`);
      continue;
    }
    lines.push(`[${nonEmpty(block.type) ?? "block"}]`);
  }
  return lines;
}

/**
 * Whether a tool call's output should go through the transcript markdown
 * renderer rather than a literal `<pre>`.
 *
 * Claude (and others) wrap shell results in a fenced block (` ```console `);
 * dumping that fence as characters is the thing a reader notices. JSON and
 * plain stdout have no fence and must stay literal — markdown would italicize
 * `project_path` and similar.
 */
export function toolOutputIsMarkdown(text: string): boolean {
  return text.includes("```");
}

/**
 * A tool call's `rawInput` (RFC 0043 tweak: the expanded row's **Input**
 * section) for display — vendor-shaped and `unknown` by the SDK's own
 * definition, so this narrows it only enough to print it, never to interpret
 * it. A bare string prints as-is (the common case — a shell command, a file
 * path); anything else is pretty-printed JSON. `undefined`/`null`/`{}` (an
 * agent that sent `rawInput` but with nothing in it) show nothing, the same
 * "absent means nothing to say" rule the rest of this file follows.
 */
export function formatToolInput(rawInput: unknown): string | undefined {
  if (rawInput === undefined || rawInput === null) return undefined;
  if (typeof rawInput === "string") return nonEmpty(rawInput);
  if (typeof rawInput === "object" && Object.keys(rawInput).length === 0) {
    return undefined;
  }
  return JSON.stringify(rawInput, null, 2);
}

/** Project a `plan` update's entries into rows. The SDK has already dropped
 *  entries with nothing to show; this fills in the status default the panel
 *  renders with, since the protocol leaves `status` optional. */
export function planRows(
  entries: readonly AgentPlanEntry[] | undefined,
): PlanRow[] {
  if (!entries) return [];
  return entries.map((e) => ({
    content: e.content,
    status: nonEmpty(e.status) ?? "pending",
    ...(nonEmpty(e.priority) ? { priority: e.priority } : {}),
  }));
}

function appendEntry(t: Transcript, make: (key: string) => TranscriptEntry) {
  const seq = t.seq + 1;
  return { entries: [...t.entries, make(`e${seq}`)], seq };
}

/** The key {@link appendEntry} will give the *next* entry appended to `t` —
 *  predictable ahead of the append itself, so a caller starting a turn (the
 *  panel, tracking `Worked for …` timing — RFC 0043 finding 1) can key that
 *  timing to the user message before `appendUserMessage` runs. */
export function nextEntryKey(t: Transcript): string {
  return `e${t.seq + 1}`;
}

/**
 * Seed a transcript from the **transcript journal** (RFC 0042) — prior turns
 * to paint before subscribing to the live update stream, exactly the shape
 * `AgentSessionHandle.journal` hands back. Folds each entry through
 * {@link applyUpdate}, the same reducer live updates go through, so a
 * restored panel and a freshly-connected one render identically.
 */
export function seedFromJournal(
  journal: readonly AgentSessionUpdate[],
): Transcript {
  return journal.reduce(applyUpdate, emptyTranscript);
}

/** Append the user's own prompt. The stream does not echo it back, so the
 *  panel adds it when it sends the turn. `attachments` are the file names sent
 *  as `resource_link` blocks alongside the text. */
export function appendUserMessage(
  t: Transcript,
  text: string,
  attachments: readonly string[] = [],
): Transcript {
  return appendEntry(t, (key) => ({
    type: "message",
    key,
    role: "user",
    text,
    ...(attachments.length > 0 ? { attachments } : {}),
  }));
}

/** Append one of Silo's own notices (a stop reason, a dropped connection). */
export function appendNotice(
  t: Transcript,
  tone: NoticeEntry["tone"],
  text: string,
): Transcript {
  return appendEntry(t, (key) => ({ type: "notice", key, tone, text }));
}

/**
 * Fold one `session/update` into the transcript.
 *
 * Streaming text merges into the entry it belongs to: same role **and** the
 * same `messageId`, or — for an agent that omits ids entirely, which the host
 * only synthesizes one for per run — the immediately preceding entry of that
 * role. A tool call or plan between two runs of text therefore ends the first
 * run, which is exactly where a new bubble should start.
 *
 * Returns `t` unchanged (same reference) for a kind this panel does not
 * render, so a caller can skip a re-render on it.
 */
export function applyUpdate(
  t: Transcript,
  update: AgentSessionUpdate,
): Transcript {
  const role = CHUNK_ROLES[update.kind];
  if (role) {
    const text = update.text;
    if (!text) return t;
    const last = t.entries[t.entries.length - 1];
    if (
      last?.type === "message" &&
      last.role === role &&
      last.messageId === update.messageId
    ) {
      const merged: MessageEntry = { ...last, text: last.text + text };
      return {
        entries: [...t.entries.slice(0, -1), merged],
        seq: t.seq,
      };
    }
    return appendEntry(t, (key) => ({
      type: "message",
      key,
      role,
      ...(update.messageId ? { messageId: update.messageId } : {}),
      text,
    }));
  }

  if (update.kind === "tool_call" || update.kind === "tool_call_update") {
    // A call the SDK could not give an id is one nothing can be keyed by; it
    // still gets a row of its own rather than vanishing.
    const call: AgentToolCall = update.toolCall ?? { toolCallId: "" };
    const toolCallId = call.toolCallId;
    const lines = toolContentLines(call.content);
    const diffs = resolveToolDiffs(call.content, call.rawInput);
    const index = toolCallId
      ? t.entries.findIndex(
          (e) => e.type === "tool" && e.toolCallId === toolCallId,
        )
      : -1;
    if (index >= 0) {
      const prev = t.entries[index] as ToolEntry;
      const toolKind = nonEmpty(call.kind) ?? prev.toolKind;
      const next: ToolEntry = {
        ...prev,
        title: nonEmpty(call.title) ?? prev.title,
        status: nonEmpty(call.status) ?? prev.status,
        ...(toolKind ? { toolKind } : {}),
        // A `tool_call_update` carrying no content must not blank the rows the
        // original call already showed.
        lines: lines.length > 0 ? lines : prev.lines,
        diffs: diffs.length > 0 ? diffs : prev.diffs,
        // Same tolerance: an update rarely repeats the original input, so
        // `undefined` here means "unchanged", not "now empty".
        rawInput: call.rawInput !== undefined ? call.rawInput : prev.rawInput,
      };
      const entries = [...t.entries];
      entries[index] = next;
      return { entries, seq: t.seq };
    }
    // An update for a call whose `tool_call` never arrived still deserves a
    // row — dropping it would lose the only record of what the agent did.
    return appendEntry(t, (key) => ({
      type: "tool",
      key,
      toolCallId,
      title: nonEmpty(call.title) ?? "Tool call",
      status: nonEmpty(call.status) ?? "pending",
      ...(nonEmpty(call.kind) ? { toolKind: call.kind } : {}),
      lines,
      ...(diffs.length > 0 ? { diffs } : {}),
      ...(call.rawInput !== undefined ? { rawInput: call.rawInput } : {}),
    }));
  }

  if (update.kind === "plan") {
    const rows = planRows(update.plan);
    const index = t.entries.findIndex((e) => e.type === "plan");
    if (index >= 0) {
      const entries = [...t.entries];
      entries[index] = { ...(t.entries[index] as PlanEntry), rows };
      return { entries, seq: t.seq };
    }
    if (rows.length === 0) return t;
    return appendEntry(t, (key) => ({ type: "plan", key, rows }));
  }

  // `available_commands_update`, `current_mode_update`, `usage_update`, and
  // whatever a vendor adds next: not rendered, not an error.
  return t;
}

/** Badge tone for a tool call's protocol status. Unknown statuses read as
 *  neutral rather than guessing at success or failure. */
export function toolStatusTone(
  status: string,
): "neutral" | "accent" | "ok" | "err" {
  switch (status) {
    case "pending":
      return "neutral";
    case "in_progress":
      return "accent";
    case "completed":
      return "ok";
    case "failed":
      return "err";
    default:
      return "neutral";
  }
}

/** One conversational turn: the user's message (absent only for a leading
 *  turn — entries the agent produced before any user message, which the live
 *  panel never has but a journal in principle could) plus everything the
 *  agent produced in reply, up to (excluding) the next user message. */
export interface Turn {
  readonly key: string;
  readonly user: MessageEntry | undefined;
  readonly rest: readonly TranscriptEntry[];
}

/**
 * Group a transcript's flat entry list into {@link Turn}s (RFC 0043) — the
 * unit the panel groups spacing and a completion footer by. A pure
 * projection of `entries`; carries no timing (turn duration is not part of
 * the wire protocol or the journal, so the component tracks that itself,
 * keyed by a turn's index in the array this returns).
 */
export function groupTurns(
  entries: readonly TranscriptEntry[],
): readonly Turn[] {
  const turns: Turn[] = [];
  let current: TranscriptEntry[] = [];
  let user: MessageEntry | undefined;
  let started = false;

  const flush = () => {
    if (!started) return;
    turns.push({ key: `t${turns.length}`, user, rest: current });
    current = [];
    user = undefined;
  };

  for (const entry of entries) {
    if (entry.type === "message" && entry.role === "user") {
      flush();
      started = true;
      user = entry;
      continue;
    }
    started = true;
    current.push(entry);
  }
  flush();
  return turns;
}

/** `"18s"` / `"1m 30s"` — a bare duration, for the turn footer's *live*
 *  ticking readout (RFC 0043 finding 1: Paseo shows the elapsed time on its
 *  own while a turn is running, and only prefixes "Worked for" once it's
 *  done — see {@link workedForLabel}). Never negative: a duration this panel
 *  measures itself can't be, but a clock can still jitter by a tick. */
export function elapsedLabel(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/** `"Worked for 18s"` — the completed-turn footer label, matched to Paseo's
 *  own string (`packages/app/src/components/message.tsx:637` in the Paseo
 *  clone) — RFC 0043 finding 1. */
export function workedForLabel(durationMs: number): string {
  return `Worked for ${elapsedLabel(durationMs)}`;
}

/**
 * How a finished turn should read in the transcript. `"end_turn"` needs no
 * commentary — the agent's own text is the answer — so this returns
 * `undefined` for it and the panel adds nothing.
 */
export function stopReasonNotice(
  stopReason: string,
): { tone: NoticeEntry["tone"]; text: string } | undefined {
  switch (stopReason) {
    case "end_turn":
      return undefined;
    case "cancelled":
      return { tone: "info", text: "Stopped." };
    case "refusal":
      return { tone: "warn", text: "The agent declined this request." };
    case "max_tokens":
      return { tone: "warn", text: "The agent hit its token budget." };
    case "max_turn_requests":
      return { tone: "warn", text: "The agent hit its request budget." };
    default:
      return { tone: "info", text: `The turn ended: ${stopReason}.` };
  }
}
