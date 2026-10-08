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
  AgentDelegationState,
  AgentPlanEntry,
  AgentSessionUpdate,
  AgentToolCall,
  AgentToolCallContent,
} from "@silo-code/sdk";
import { resolveToolDiffs, type ToolDiff } from "./tool-diff";
import { formatToolKindLabel } from "./tool-display";

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
  /** When the user sent this turn (`role === "user"` only), as epoch ms —
   *  shown on hover alongside the copy action. Set either by
   *  {@link appendUserMessage} (a prompt this panel itself just sent) or by
   *  {@link applyUpdate} reading {@link AgentSessionUpdate.timestamp} off the
   *  synthesized `user_message_chunk` the host journals at send time — the
   *  latter is what keeps this surviving a **transcript journal** replay
   *  (`session/resume`, a `journal-only` restore, or simply reconnecting).
   *  `undefined` only for a turn old enough to predate this field. */
  readonly sentAt?: number;
  /** The **delegated worker that said this** (RFC 0057), when the run came
   *  from a subagent rather than the agent itself. Such a run is drawn inside
   *  its dispatch's block, never as the agent's own prose — a subagent's
   *  "I will reply FINISHED once it completes" read as the parent speaking is
   *  precisely the mis-attribution routing exists to prevent. */
  readonly subagentId?: string;
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
  /** This call dispatched a subagent (RFC 0055). Accumulated across frames —
   *  the marker rides only the opening frames. */
  readonly subagent?: boolean;
  /** This call handed its work off to run elsewhere, so {@link status} is
   *  about the hand-off and **not** about the work. The row must not render
   *  as settled (RFC 0055). */
  readonly handedOff?: boolean;
  /** The `toolCallId` of the dispatch this call was made on behalf of — set
   *  on every call a subagent makes. Resolved against the transcript's own
   *  tool entries by id, because the children can land in a later turn than
   *  the dispatch. */
  readonly parentToolCallId?: string;
  /** The delegated worker **this call dispatched** (RFC 0057) — the id that
   *  joins this row to its worker's forwarded prose and to the terminal state
   *  the worker eventually reports. Accumulated across frames, as
   *  {@link subagent} is. */
  readonly subagentId?: string;
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

/** A run of {@link TOOL_GROUP_THRESHOLD}+ consecutive non-diff tool calls,
 *  folded under one collapsible header at render time (Dave's call) — a burst
 *  of grep/Read-shaped calls otherwise reads as one row per call. Not a
 *  {@link TranscriptEntry}: it never enters `Transcript.entries` itself, only
 *  the view {@link foldToolRuns} produces from them. */
export interface ToolGroupEntry {
  readonly type: "tool-group";
  readonly key: string;
  readonly tools: readonly ToolEntry[];
  /**
   * Nothing further can join this run — something already follows it, so
   * {@link foldToolRuns} would start a new run for the agent's next call.
   *
   * The **one-way** signal a collapsed view needs. "Every call has settled" is
   * not one: an agent pauses between calls, so a run goes settled, grows,
   * settles again, and a view keyed on that opens and shuts as it works
   * (Dave, 2026-10-08). Whether a run is closed only ever goes from false to
   * true, because the entry that closed it never goes away.
   *
   * `false` for the run at the end of a turn, which is where a live agent is
   * still working — and also for a past turn that simply ended on tool calls,
   * where leaving it open is the honest reading: nothing ever concluded it.
   */
  readonly closed: boolean;
}

/** A subagent dispatch plus the calls made on its behalf, drawn as one block
 *  so a subagent's work reads as *its* work (RFC 0055). Like
 *  {@link ToolGroupEntry} this is a render-time projection only — it never
 *  enters `Transcript.entries`, and the entries it holds are not moved. */
export interface DelegatedGroupEntry {
  readonly type: "delegated-group";
  readonly key: string;
  /** The dispatching call — the `Agent(…)` row the block is headed by. */
  readonly dispatch: ToolEntry;
  /**
   * What this dispatch's subagent did, in arrival order — its tool calls and,
   * once the agent forwards them (RFC 0057), its own messages.
   *
   * Heterogeneous on purpose: a subagent's prose is as much its work as its
   * calls are, and the two interleave — the capture has the worker explaining
   * itself *after* backgrounding a shell. Splitting them into two lists would
   * lose that order, which is the order a reader needs to follow what the
   * worker was doing.
   *
   * May be empty: a dispatch whose children land in a later turn still heads
   * its own block.
   */
  readonly work: readonly (ToolEntry | MessageEntry)[];
}

/** What the transcript view renders, one turn's entries at a time — either an
 *  ordinary entry, a folded run of them, or a dispatch with its delegated
 *  work. */
export type RenderEntry =
  | TranscriptEntry
  | ToolGroupEntry
  | DelegatedGroupEntry;

/**
 * The reduced transcript. `seq` is the key counter — carried in the state so
 * the reducer stays pure and every entry gets a React key that is stable
 * across re-renders and unique even for two consecutive anonymous runs.
 */
export interface Transcript {
  readonly entries: readonly TranscriptEntry[];
  readonly seq: number;
  /**
   * Where each delegated worker is in its life, keyed by subagent id —
   * **last-write-wins** over the {@link AgentSessionUpdate.delegation} events
   * (RFC 0057).
   *
   * Separate from `entries` because it is a *different kind of thing*: an
   * entry is a row of history, while this is the current state of work that
   * outlives the turn that started it. A worker's terminal state arrives long
   * after its dispatch row was drawn — the capture has one landing 25s after
   * the parent's turn ended — so the row cannot carry it, and the row must
   * keep rendering what it found here even once the session has gone idle.
   *
   * Empty against an agent that doesn't report delegation, which is what
   * makes every consumer of it degrade to RFC 0055's rendering.
   */
  readonly delegations: ReadonlyMap<string, AgentDelegationState>;
}

export const emptyTranscript: Transcript = {
  entries: [],
  seq: 0,
  delegations: new Map(),
};

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
 * Whether {@link groupDelegatedCalls} will lift this entry out of the
 * top-level flow and into a dispatch's block — a delegated worker's own prose,
 * or a tool call it made (RFC 0057).
 *
 * The dispatch row itself is deliberately **not** delegated work by this test:
 * it heads the block and stays in the flow, so it still ends a run of the
 * agent's text, exactly as any other tool call does.
 *
 * One imprecision, called out rather than hidden: with two workers running at
 * once this cannot tell one worker's calls from another's, since a delegated
 * call records the dispatch it serves and not the worker. The only consequence
 * is which bubble a worker's *own* prose continues, inside its own block.
 */
function isDelegatedWork(e: TranscriptEntry): boolean {
  if (e.type === "message") return e.subagentId !== undefined;
  if (e.type === "tool") return e.parentToolCallId !== undefined;
  return false;
}

/**
 * Whether an `"agent"` or `"thought"` message has nothing in it worth a row
 * over — empty, or holding only whitespace.
 *
 * Some providers (observed on `omlx/Gemma 4 26B` via OpenCode) stream a
 * throwaway chunk that is just `"\n"` — a `agent_thought_chunk` with no real
 * reasoning, or even an `agent_message_chunk` under its own `messageId`
 * alongside the turn's real reply — rather than omitting the chunk
 * entirely. Rendered as-is that is still its own transcript entry: an empty
 * (for `"thought"`, labeled) body, with the transcript's standard
 * `.acp-chat__turn-body > * + *` 30px rhythm still applying above and below
 * it, so it reads as dead space between the rows with real content. The
 * panel checks this before rendering an agent/thought row at all — never a
 * `"user"` turn, which may carry only attachments and no text.
 */
export function isBlankMessageText(text: string): boolean {
  return text.trim().length === 0;
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
  return { ...t, entries: [...t.entries, make(`e${seq}`)], seq };
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
    sentAt: Date.now(),
    ...(attachments.length > 0 ? { attachments } : {}),
  }));
}

/** Format a {@link MessageEntry.sentAt} for the hover-only timestamp next to
 *  a user message's copy action, e.g. `"Sep 7 3:38 PM"`. */
export function formatMessageSentAt(sentAt: number): string {
  const date = new Date(sentAt);
  const datePart = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} ${timePart}`;
}

/** Every non-empty prompt the user has sent in this session, oldest first —
 *  what the composer's ↑/↓ history recall steps through. Draws on the same
 *  `entries` a restored panel seeds from ({@link seedFromJournal}), so
 *  recall reaches back before this mount, not just this run's own sends.
 *
 *  A resent prompt keeps only its most recent send — re-sending "yes" five
 *  times across a session shouldn't make ↑ walk through "yes" five times
 *  before reaching anything else (shell history's `HISTCONTROL=erasedups`). */
export function userPromptHistory(t: Transcript): readonly string[] {
  const texts: string[] = [];
  for (const e of t.entries) {
    if (e.type === "message" && e.role === "user" && e.text.trim().length > 0) {
      texts.push(e.text);
    }
  }
  const lastIndex = new Map<string, number>();
  texts.forEach((text, i) => lastIndex.set(text, i));
  return texts.filter((text, i) => lastIndex.get(text) === i);
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
  // A delegated worker's lifecycle (RFC 0057). Not a row of its own — a
  // worker appearing is not news, and its finishing is news *about the
  // dispatch row that already exists*. Last-write-wins: the agent re-announces
  // a worker that resumes, and Silo has already collapsed the generations onto
  // one id, so the latest word is simply the current one.
  const delegation = update.delegation;
  if (delegation) {
    const delegations = new Map(t.delegations);
    delegations.set(delegation.subagentId, delegation.state);
    return { ...t, delegations };
  }

  const role = CHUNK_ROLES[update.kind];
  if (role) {
    const text = update.text;
    if (!text) return t;
    // Find the run this chunk continues.
    //
    // **A run ends at the previous entry _in the same column_, not simply at
    // the previous entry** (RFC 0057). A tool call or plan the agent made
    // itself still ends the run — text, a call, then more text reads as two
    // paragraphs around the call, which is the whole point of the rule. But a
    // delegated worker's rows are *relocated* out of this flow at render time
    // into their dispatch's block, so they sit between the agent's chunks in
    // `entries` while appearing nowhere between them on screen. Treating those
    // as a break split one of the agent's sentences into two bubbles with a
    // blank gap between them — Dave's screenshot, 2026-10-08.
    //
    // So: walk back over the entries that will be relocated, and judge the run
    // by the first one that stays put.
    const sameFlow = (e: TranscriptEntry): boolean =>
      isDelegatedWork(e) === (update.subagentId !== undefined);

    const matches = (e: TranscriptEntry): e is MessageEntry =>
      e.type === "message" &&
      e.role === role &&
      e.messageId === update.messageId &&
      // Two speakers, never one bubble. A worker's run and the parent's can
      // share a `messageId` only by accident, but merging across that would
      // splice a subagent's words into the agent's own paragraph.
      e.subagentId === update.subagentId;

    let index = -1;
    for (let i = t.entries.length - 1; i >= 0; i--) {
      const entry = t.entries[i]!;
      if (!sameFlow(entry)) continue;
      if (matches(entry)) index = i;
      // The first entry in this chunk's own column decides it: either it is the
      // run being continued, or the run ended there.
      break;
    }

    if (index >= 0) {
      const prev = t.entries[index] as MessageEntry;
      const merged: MessageEntry = { ...prev, text: prev.text + text };
      const entries = [...t.entries];
      entries[index] = merged;
      return { ...t, entries, seq: t.seq };
    }
    const sentAt =
      role === "user" && update.timestamp !== undefined
        ? Date.parse(update.timestamp)
        : undefined;
    return appendEntry(t, (key) => ({
      type: "message",
      key,
      role,
      ...(update.messageId ? { messageId: update.messageId } : {}),
      text,
      ...(sentAt !== undefined && !Number.isNaN(sentAt) ? { sentAt } : {}),
      ...(update.subagentId !== undefined
        ? { subagentId: update.subagentId }
        : {}),
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
        // The delegated-work facts (RFC 0055) arrive on *different* frames of
        // the same call: the subagent marker on the opening ones, the hand-off
        // on a later one carrying no status, and `status: "completed"` on one
        // carrying no hand-off. Accumulating them here — never clearing — is
        // the whole reason the row ends up knowing it is a dispatch that was
        // handed off rather than a call that finished.
        subagent: call.subagent ?? prev.subagent,
        handedOff: call.handedOff ?? prev.handedOff,
        parentToolCallId: call.parentToolCallId ?? prev.parentToolCallId,
        subagentId: call.subagentId ?? prev.subagentId,
      };
      const entries = [...t.entries];
      entries[index] = next;
      return { ...t, entries, seq: t.seq };
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
      ...(call.subagent !== undefined ? { subagent: call.subagent } : {}),
      ...(call.handedOff !== undefined ? { handedOff: call.handedOff } : {}),
      ...(call.parentToolCallId !== undefined
        ? { parentToolCallId: call.parentToolCallId }
        : {}),
      ...(call.subagentId !== undefined ? { subagentId: call.subagentId } : {}),
    }));
  }

  if (update.kind === "plan") {
    const rows = planRows(update.plan);
    const index = t.entries.findIndex((e) => e.type === "plan");
    if (index >= 0) {
      const entries = [...t.entries];
      entries[index] = { ...(t.entries[index] as PlanEntry), rows };
      return { ...t, entries, seq: t.seq };
    }
    if (rows.length === 0) return t;
    return appendEntry(t, (key) => ({ type: "plan", key, rows }));
  }

  // `available_commands_update`, `current_mode_update`, `usage_update`, and
  // whatever a vendor adds next: not rendered, not an error.
  return t;
}

/**
 * Force every tool call still `"pending"` / `"in_progress"` to `"failed"`.
 *
 * A turn that ends without a final `tool_call_update` for a call it started
 * — the agent's own connection dropped mid-tool-call, a permission request
 * it was waiting on sat unanswered until the upstream connection gave up,
 * the turn was canceled — otherwise leaves that row's spinner badge showing
 * forever, since nothing in the stream will ever move it out of that
 * status. Call once a turn's `prompt()` has settled, success or not; only
 * one turn runs at a time, so anything still non-terminal at that point
 * belongs to the turn that just ended.
 *
 * A **handed-off** dispatch (RFC 0055) needs no special case here, and its
 * absence is deliberate rather than an oversight: the vendor settles such a
 * call to `"completed"` moments after the hand-off, so by the time this sweep
 * runs the row is already terminal and the filter below never sees it. There
 * is nothing to fail — the work it dispatched is elsewhere, and this function
 * only reasons about calls *this* session left open.
 */
export function closeDanglingTools(t: Transcript): Transcript {
  let changed = false;
  const entries = t.entries.map((e) => {
    if (
      e.type === "tool" &&
      (e.status === "pending" || e.status === "in_progress")
    ) {
      changed = true;
      return { ...e, status: "failed" };
    }
    return e;
  });
  return changed ? { ...t, entries } : t;
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

/**
 * Whether two {@link Turn}s describe the same entries — the equality the
 * panel memoizes a rendered turn on.
 *
 * {@link groupTurns} is a projection: it builds fresh `Turn` objects (and
 * fresh `rest` arrays) on every call, so two runs over an unchanged
 * transcript are never `===`. The *entries* inside them are what's stable —
 * {@link applyUpdate} replaces only the entry it patches and shares the rest
 * — so identity per entry is the signal worth comparing. A streaming turn
 * fails this and re-renders; every turn above it passes and doesn't.
 */
export function sameTurn(a: Turn, b: Turn): boolean {
  if (a.key !== b.key || a.user !== b.user) return false;
  if (a.rest.length !== b.rest.length) return false;
  return a.rest.every((entry, i) => entry === b.rest[i]);
}

/** A run this long or longer folds under a collapsible group. */
export const TOOL_GROUP_THRESHOLD = 6;
/** How many of a group's most recent calls stay visible inline once folded;
 *  the rest sit behind "N more, expand to see them all". */
export const TOOL_GROUP_INLINE_COUNT = 5;

/**
 * Fold one turn's entries into {@link RenderEntry}s (RFC 0043 companion) —
 * the transcript's spacing/grouping unit for tool calls, the way
 * {@link groupTurns} is for turns. A pure projection, recomputed at render
 * time rather than stored on `Transcript`, so it never has to be kept in sync
 * as `applyUpdate` patches a call in place.
 *
 * A run of {@link TOOL_GROUP_THRESHOLD}+ consecutive tool calls, none of them
 * carrying a diff or ending `"failed"`, folds into one {@link
 * ToolGroupEntry}. A diff-producing call (an Edit/Write), a failed call, and
 * anything that isn't a tool call at all, e.g. the agent's own prose between
 * two calls — each breaks the run and renders in full, on its own, so a
 * failure is never a fold away from view; folding resumes only after another
 * run this long follows it.
 *
 * A subagent dispatch and a delegated call (RFC 0055) break the run for the
 * same reason: delegated work is the thing the user asked to be able to see,
 * and folding it into `"14 Shell · 3 Read"` would hide exactly that. The
 * delegated grouping below runs first, so what reaches the run-folding is
 * already free of the calls that were gathered under a dispatch.
 */
export function foldToolRuns(
  entries: readonly TranscriptEntry[],
): readonly RenderEntry[] {
  const out: RenderEntry[] = [];
  let run: ToolEntry[] = [];

  /** `closed` — see {@link ToolGroupEntry.closed}. A run flushed because
   *  something broke it can never grow again; the one flushed at the end of
   *  the turn still can. */
  const flushRun = (closed: boolean) => {
    if (run.length >= TOOL_GROUP_THRESHOLD) {
      out.push({
        type: "tool-group",
        key: `g${run[0]!.key}`,
        tools: run,
        closed,
      });
    } else {
      out.push(...run);
    }
    run = [];
  };

  for (const entry of groupDelegatedCalls(entries)) {
    if (
      entry.type === "tool" &&
      (entry.diffs?.length ?? 0) === 0 &&
      entry.status !== "failed" &&
      !entry.subagent &&
      entry.parentToolCallId === undefined
    ) {
      run.push(entry);
      continue;
    }
    flushRun(true);
    out.push(entry);
  }
  flushRun(false);
  return out;
}

/**
 * Gather each subagent dispatch's calls underneath it (RFC 0055) — the pass
 * that turns seven interleaved agents' reads into seven readable blocks.
 *
 * **Scoped to one turn's entries, and that is the whole design.** The caller
 * is {@link foldToolRuns}, which runs per turn, so this only ever reorders
 * *within* a contiguous slice — never across a turn boundary. That matters:
 * {@link groupTurns} models a turn as a contiguous slice of `entries`, so
 * hoisting a call from one turn into another would corrupt the grouping for
 * the whole transcript, not just these rows. Reordering inside a slice is
 * exactly what the run-folding beside it already does, and is safe for the
 * same reason — nothing is moved in `Transcript.entries`; this is a view.
 *
 * So a delegated call is gathered **only when its dispatch is in the same
 * turn**. In the other observed regime — the parent's turn ends at the
 * hand-off and the subagent's calls arrive in a later, agent-initiated turn —
 * the calls render where they landed, carrying the attribution label instead.
 * That is a real shape, not a failure, and so is a journal replayed from
 * mid-delegation, where the dispatch is not in the transcript at all.
 *
 * Order is preserved: each block sits where its **dispatch** appeared, and the
 * calls inside it stay in arrival order.
 */
export function groupDelegatedCalls(
  entries: readonly TranscriptEntry[],
): readonly (TranscriptEntry | DelegatedGroupEntry)[] {
  const groups = new Map<string, DelegatedGroupEntry>();
  /** Dispatch call id by the worker it dispatched — the route a subagent's
   *  *prose* takes to its block. A child's tool call carries
   *  `parentToolCallId` and needs no lookup, but a message entry has no such
   *  field (it is a property of a tool call), so its only join is the worker
   *  id it was attributed with. */
  const bySubagent = new Map<string, string>();
  for (const entry of entries) {
    if (entry.type === "tool" && entry.subagent && entry.toolCallId) {
      groups.set(entry.toolCallId, {
        type: "delegated-group",
        key: `d${entry.key}`,
        dispatch: entry,
        work: [],
      });
      if (entry.subagentId !== undefined)
        bySubagent.set(entry.subagentId, entry.toolCallId);
    }
  }
  if (groups.size === 0) return entries;

  /** Append `entry` to the block `parentId` heads, if there is one. */
  const absorb = (
    parentId: string | undefined,
    entry: ToolEntry | MessageEntry,
  ): boolean => {
    const parent = parentId !== undefined ? groups.get(parentId) : undefined;
    if (!parent) return false;
    groups.set(parent.dispatch.toolCallId, {
      ...parent,
      work: [...parent.work, entry],
    });
    return true;
  };

  const out: (TranscriptEntry | DelegatedGroupEntry)[] = [];
  for (const entry of entries) {
    // A worker's forwarded prose belongs in its block, never in the flow of
    // the parent's own messages (RFC 0057). A run attributed to a worker whose
    // dispatch this transcript never saw — a replay starting mid-delegation —
    // falls through and renders on its own rather than vanishing.
    if (entry.type === "message") {
      if (
        entry.subagentId !== undefined &&
        absorb(bySubagent.get(entry.subagentId), entry)
      )
        continue;
      out.push(entry);
      continue;
    }
    if (entry.type !== "tool") {
      out.push(entry);
      continue;
    }
    const own = entry.subagent ? groups.get(entry.toolCallId) : undefined;
    if (own) {
      // The block takes the dispatch's place in document order.
      out.push(own);
      continue;
    }
    if (absorb(entry.parentToolCallId, entry)) continue;
    out.push(entry);
  }
  // The map was rebuilt as calls accumulated, so re-read each block to pick up
  // the children gathered after its placeholder went into `out`.
  return out.map((e) =>
    e.type === "delegated-group" ? (groups.get(e.dispatch.toolCallId) ?? e) : e,
  );
}

/**
 * Whether every call in a folded run has settled, so the run can collapse
 * completely (Dave's call — the same treatment a finished dispatch gets).
 *
 * "Settled" is {@link isToolRunning}'s answer, inverted, for every member —
 * one source for the question across the whole panel. A run with anything
 * still pending or in flight stays open, because the tail of it is exactly
 * what a reader watches while work is happening.
 *
 * An empty run is vacuously settled; it never reaches the renderer, since a
 * group only exists at {@link TOOL_GROUP_THRESHOLD}+ calls.
 */
export function toolGroupSettled(tools: readonly ToolEntry[]): boolean {
  return !tools.some(isToolRunning);
}

/**
 * Whether a folded run should collapse to its header.
 *
 * **Both conditions, and each rules out a different wrong look:**
 *
 * - {@link ToolGroupEntry.closed} — nothing more can join the run. Without it
 *   the block collapses the moment the agent pauses, re-opens when its next
 *   call lands in the same run, and collapses again, flickering its way
 *   through a turn. In practice this is the agent's own reply arriving, which
 *   is what ends a run.
 * - {@link toolGroupSettled} — no call in it is still going. A closed run can
 *   still hold a call in flight, since `applyUpdate` patches a row in place
 *   wherever it sits, and collapsing over a live spinner hides the one thing
 *   worth watching.
 *
 * The subagent block needs no equivalent because its worker reports a terminal
 * state, which is already one-way.
 */
export function toolGroupCollapsed(group: ToolGroupEntry): boolean {
  return group.closed && toolGroupSettled(group.tools);
}

/**
 * The collapsed run's second line.
 *
 * The header already reads `"6 Edit · 2 Read · 1 Shell"`, so the one thing it
 * does not say is the **total** — which a reader would otherwise have to add
 * up to know what expanding is going to cost them.
 *
 * **Deliberately silent about failures, and that is not an oversight.**
 * {@link foldToolRuns} breaks a run at any call ending `"failed"`, so a failed
 * call is never inside a group to begin with. A failure count here would be a
 * branch that can never be taken — and worse, it would imply the fold needs
 * help it doesn't: the failed row is already in full view, outside the group,
 * which is a stronger guarantee than a count behind a collapsed header.
 */
export function toolGroupSummaryLabel(tools: readonly ToolEntry[]): string {
  return `expand to see all ${tools.length}`;
}

/** The folded group's header label — e.g. `"14 Shell · 3 Read"` — so a
 *  collapsed run still says what it did, not just "Tool calls...". Counts by
 *  the same display label the row itself would show, falling back to "Tool"
 *  for a call with no kind (rather than dropping it from the tally), sorted
 *  most-frequent first. */
export function toolGroupLabel(group: ToolGroupEntry): string {
  const counts = new Map<string, number>();
  for (const tool of group.tools) {
    const label = formatToolKindLabel(tool.toolKind, tool.title) ?? "Tool";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `${count} ${label}`)
    .join(" · ");
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

/**
 * Whether a tool call is still running — the **one** place that decides it.
 *
 * A **handed-off** call (RFC 0055) is the case worth naming: its status says
 * `"completed"` within a second of the hand-off while the delegated work runs
 * on, so it is neither running nor settled but a third state. The SDK states
 * this as a contract on `AgentToolCall.handedOff` ("A UI must not render such
 * a call as finished"), and a contract with three independent encodings in the
 * panel is one bug away from disagreeing with itself — so both row renderers
 * and the CSS fallback key off this.
 */
export function isToolRunning(
  entry: Pick<ToolEntry, "status" | "handedOff">,
): boolean {
  if (entry.handedOff) return false;
  return entry.status === "pending" || entry.status === "in_progress";
}

/**
 * How a dispatch's delegated worker ended, or `undefined` while it is still
 * working or never reported — the **one** place that decides it, for the same
 * reason {@link isToolRunning} is.
 *
 * **Permanent once set.** A dispatch row that has seen a terminal state says
 * so forever: a transcript row is history, and the state lives in
 * {@link Transcript.delegations} rather than in liveness, so it survives the
 * session going idle, the turn ending, and a journal replay alike. Nothing
 * here consults `AgentInfo.activity`.
 *
 * `undefined` covers three different situations on purpose, because the row
 * renders them identically — still running, never reported by this agent, and
 * reported with a state Silo does not recognise. All three mean "no outcome to
 * show", and none of them may be drawn as finished.
 */
export function delegationOutcome(
  entry: Pick<ToolEntry, "subagentId">,
  delegations: ReadonlyMap<string, AgentDelegationState>,
): AgentDelegationState | undefined {
  if (entry.subagentId === undefined) return undefined;
  const state = delegations.get(entry.subagentId);
  return state === undefined || state === "started" ? undefined : state;
}

/**
 * The badge tone for a delegated worker's outcome, and the hint beside it.
 *
 * Alongside {@link toolStatusTone} because it is the same decision for a
 * different vocabulary: the four terminal states are not equally good news, so
 * they do not all get the same chip. `"completed"` reads as a result;
 * everything else is a warning the reader may want to act on, and
 * `"disconnected"` in particular means *nobody knows* how the work ended,
 * which is worth not dressing up as a failure.
 */
export function delegationStateTone(
  state: AgentDelegationState,
): "ok" | "warn" | "err" {
  switch (state) {
    case "completed":
      return "ok";
    case "failed":
      return "err";
    default:
      return "warn";
  }
}

/**
 * The collapsed block's one-line summary of what the worker did — e.g.
 * `"14 tool calls · expand to see agent output"`.
 *
 * A finished dispatch collapses to its header plus this row (Dave's call): the
 * worker's calls and its final answer are a lot of transcript, and once it has
 * finished they are reference material rather than something to watch. The
 * line still has to say *that there is something there*, or a collapsed block
 * reads as an agent that did nothing — which is the failure the
 * {@link DelegationView.delegatedCounts} badge exists to avoid elsewhere.
 *
 * Counts tool calls only. A worker's prose is not countable in any way worth
 * showing ("3 messages" means nothing to a reader), so it is covered by
 * "agent output" instead — which is also the honest label when the worker made
 * no calls at all and the block holds nothing but its answer.
 */
export function delegatedSummaryLabel(
  work: readonly (ToolEntry | MessageEntry)[],
): string {
  const calls = work.reduce((n, w) => (w.type === "tool" ? n + 1 : n), 0);
  const tail = "expand to see agent output";
  if (calls === 0) return tail;
  return `${calls} tool ${calls === 1 ? "call" : "calls"} · ${tail}`;
}

/** The dispatch row's label — `"Agent(Sleep then reply)"`. The reducer has
 *  already relabelled the row from the vendor's opening `"Task"` to the
 *  streamed description, so this just wraps whatever title the wire settled
 *  on; a dispatch whose description never arrived still reads sensibly
 *  (`"Agent(Task)"`) rather than rendering nothing. */
export function dispatchLabel(title: string): string {
  return `Agent(${title})`;
}

/**
 * What a row needs to know about delegation that it cannot see in itself:
 * every dispatch's title, and how many calls have been made on its behalf.
 *
 * Whole-transcript rather than per-row because the two sides of a delegation
 * can be arbitrarily far apart — the children of a dispatch routinely arrive
 * in a *later*, agent-initiated turn than the dispatch itself — so a
 * delegated call resolves its dispatch **by id, never by position**.
 */
export interface DelegationView {
  /** Each dispatch's title, keyed by its `toolCallId`. A delegated call whose
   *  dispatch isn't here (a journal replay that starts mid-delegation) is a
   *  real shape: render it as an ordinary call rather than claiming a dispatch
   *  that cannot be found. */
  readonly dispatchTitles: ReadonlyMap<string, string>;
  /** How many delegated calls each dispatch has been seen to make. Shown on
   *  the dispatch row, because its children render where they arrive — so
   *  without a count the dispatch would say nothing about work that is
   *  demonstrably happening under it. */
  readonly delegatedCounts: ReadonlyMap<string, number>;
  /** Each delegated worker's state, passed straight through from
   *  {@link Transcript.delegations} so a dispatch row can read its own
   *  outcome through {@link delegationOutcome} without a second prop. */
  readonly delegations: ReadonlyMap<string, AgentDelegationState>;
}

/** The empty view — shared, so the overwhelmingly common case (no delegation
 *  anywhere in the transcript) keeps a stable identity for free. */
export const emptyDelegationView: DelegationView = {
  dispatchTitles: new Map(),
  delegatedCounts: new Map(),
  delegations: new Map(),
};

/** Project the delegation picture out of a whole transcript. */
export function delegationView(t: Transcript): DelegationView {
  const dispatchTitles = new Map<string, string>();
  const delegatedCounts = new Map<string, number>();
  for (const entry of t.entries) {
    if (entry.type !== "tool") continue;
    if (entry.subagent && entry.toolCallId) {
      dispatchTitles.set(entry.toolCallId, entry.title);
    }
    const parent = entry.parentToolCallId;
    if (parent !== undefined) {
      delegatedCounts.set(parent, (delegatedCounts.get(parent) ?? 0) + 1);
    }
  }
  if (
    dispatchTitles.size === 0 &&
    delegatedCounts.size === 0 &&
    t.delegations.size === 0
  ) {
    return emptyDelegationView;
  }
  return { dispatchTitles, delegatedCounts, delegations: t.delegations };
}

/**
 * A cheap string that changes exactly when {@link delegationView} would
 * produce something different.
 *
 * The view is handed to every tool row, so rebuilding it on each streamed
 * chunk would change that prop's identity and invalidate the memo on every
 * turn in the transcript. Comparing this signature instead keeps the view's
 * identity stable through the long stretches where text is streaming and the
 * delegation picture is standing still.
 */
export function delegationSignature(t: Transcript): string {
  let sig = "";
  // A worker reporting in changes every dispatch row's badge and the notice's
  // count, so the state map is part of what the signature covers.
  for (const [id, state] of t.delegations) sig += `s\0${id}\0${state}`;
  for (const entry of t.entries) {
    if (entry.type === "message") {
      // A worker's prose moves into its block, so a run appearing — or being
      // attributed — changes what the view must draw.
      if (entry.subagentId !== undefined) sig += `m\0${entry.subagentId}`;
      continue;
    }
    if (entry.type !== "tool") continue;
    if (entry.subagent)
      sig += `d\0${entry.toolCallId}\0${entry.title}\0${entry.subagentId ?? ""}`;
    if (entry.parentToolCallId !== undefined) {
      sig += `c\0${entry.parentToolCallId}`;
    }
  }
  return sig;
}

/**
 * The `"2 background agents working"` notice, or `undefined` when nothing this
 * exchange dispatched is still outstanding.
 *
 * **It counts outstanding work, and the count comes down.** That is new
 * (RFC 0057) and worth stating, because the previous version of this comment
 * argued at length that a countdown was impossible: nothing revisited a
 * dispatch to report a finish, and with several agents outstanding nothing
 * said *which* one had finished, so the number could only go up. A line
 * promising a countdown that never came read as broken (Dave, 2026-10-07), so
 * the notice retreated to counting dispatches.
 *
 * What changed is the evidence, not the taste: the adapter's AIR
 * `nativeSubagentSessions` capability — which Silo now advertises — reports a
 * **terminal state per named subagent**, and the host routes it onto
 * {@link AgentSessionUpdate.delegation}. So "which one finished" is answered,
 * and subtracting the finished from the dispatched is an honest count rather
 * than an inference from timing.
 *
 * **The old behaviour survives as the degradation path**, which is the point
 * of taking the count from {@link Transcript.delegations}: an agent that does
 * not speak the capability reports no finishes, nothing is ever subtracted,
 * and the line reads exactly as it did before — this many agents were handed
 * work. Absence of a finish is never read as a finish.
 *
 * **Scoped to the current exchange**, i.e. dispatches since the last user
 * message. Two reasons: over a long session a transcript-wide tally grows
 * without bound and stops meaning anything, and "dispatched" is naturally read
 * against what you just asked for. Sending the next prompt is therefore what
 * clears it, as is every agent finishing.
 *
 * Deliberately **not** gated on `AgentInfo.activity`. It was, and that is what
 * made the line vanish and reappear while subagents were demonstrably still
 * working: between the parent's turn ending and the next notification turn the
 * session reads idle. A statement about outstanding work does not stop being
 * true while the session is quiet — and the capture has a subagent finishing
 * 25s into exactly that quiet.
 */
export function delegatedDispatchNotice(t: Transcript): string | undefined {
  /** Dispatches in this exchange, by the worker each handed to. Keyed rather
   *  than counted so a worker reported twice is still one agent. */
  let outstanding = 0;
  let unknownFinish = 0;
  for (const entry of t.entries) {
    // A user message opens a new exchange, so anything before it belongs to a
    // question already answered.
    if (entry.type === "message" && entry.role === "user") {
      outstanding = 0;
      unknownFinish = 0;
      continue;
    }
    // `handedOff` alone is not enough: it is deliberately agent-agnostic on
    // the public surface ("handed its work off to run elsewhere"), and a
    // backgrounded *shell* is the next thing expected to set it. This line
    // says "background agents", so it counts dispatches.
    if (entry.type !== "tool" || !entry.handedOff || !entry.subagent) continue;
    // A dispatch whose worker we can't name can't be told apart from one
    // still running, so it counts as outstanding — the truthful side to err
    // on, and the whole capability-off path.
    if (entry.subagentId === undefined) {
      unknownFinish += 1;
      continue;
    }
    const state = t.delegations.get(entry.subagentId);
    if (state === undefined || state === "started") outstanding += 1;
  }
  const count = outstanding + unknownFinish;
  if (count === 0) return undefined;
  const noun = count === 1 ? "background agent" : "background agents";
  return `${count} ${noun} working`;
}
