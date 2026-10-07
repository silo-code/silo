# Design — 0055. Delegated work in a Chat session

How the requirements are satisfied. Working artifact — removed when the
proposal collapses.

Every wire claim below is checked against the committed capture
`scratchpad/acp-probe/captures/frames-2026-10-06T20-05-31-821Z.jsonl`, not
against a write-up. Frame numbers are 1-based lines in that file.

## Architecture

Two packages, in the normal direction.

**`@silo-code/extension-host`** does the parsing. The new pure module is
`packages/extension-host/src/extension-host/agents/chat-delegated-work.ts`,
beside `chat-turn-signals.ts` — which is where that file actually lives, not
in the Chat panel. It is the same shape as its neighbour: wire in, meaning out,
no state, no React, tested against the capture. It is the **only** place
`_meta.claudeCode` is read for this feature, and `parseToolCall`
(`acp-update-model.ts:106`) calls it.

**`@silo-code/sdk`** gains three optional fields on `AgentToolCall`
(`packages/sdk/src/agents-service.ts:750`). Nothing moves on the
host ↔ extension boundary beyond that: the Chat panel already reads
`AgentToolCall` through `ctx.agents.sessions`, so the panel needs no new
capability and the privileged surface is untouched.

**`@silo-code/extensions-silo`** renders. `transcript-model.ts` carries the
facts onto `ToolEntry`; `AcpChatPanel.tsx` draws them.

## The wire, as actually captured

The shape that drives the whole design — three facts spread across three
different frames on one call id:

| Frame | `status`    | `_meta.claudeCode`                                                                               |
| ----- | ----------- | ------------------------------------------------------------------------------------------------ |
| 12    | `pending`   | `{toolName: "Agent", subagent: true}`                                                            |
| 13–16 | _absent_    | `{toolName: "Agent", subagent: true}`                                                            |
| 19    | _absent_    | `{toolResponse: {isAsync: true, status: "async_launched", agentId, description, outputFile, …}}` |
| 20    | `completed` | `{toolName: "Agent"}`                                                                            |

Three consequences, each load-bearing:

1. **The hand-off and the lie are different frames.** Frame 19 carries the
   hand-off and no `status`; frame 20 carries `status: "completed"` and no
   hand-off. A per-frame parser cannot see both.
2. **`subagent` is not repeated.** It is on 12–16 and gone by 19.
3. **`_meta` is on the update envelope, not nested under a `toolCall` object.**
   `toSdkUpdate` already passes the whole update to `parseToolCall`
   (`acp-sessions-service.ts:258`), so the parser has it in hand.

Verified absent: no fourth frame revisits the dispatch, and `agentId` appears
nowhere else in the capture. The parent's `session/prompt` resolves at frame 58
with `stopReason: "end_turn"`, **after** the subagent's last child call (frame 38) — the probe's regime. The other regime (turn ends mid-flight, children
arrive in a later `task-notification` turn) is recorded in the proposal from
two Silo journals.

## Components

### `chat-delegated-work.ts` (new, pure)

```ts
export interface DelegatedWorkFacts {
  readonly subagent?: boolean;
  readonly handedOff?: boolean;
  readonly parentToolCallId?: string;
}

/** Read the vendor's delegated-work markers off one tool-call frame.
 *  Returns an empty object for any shape it does not recognise. */
export function delegatedWorkFacts(update: unknown): DelegatedWorkFacts;
```

- `subagent` ← `_meta.claudeCode.subagent === true`, nothing weaker.
- `handedOff` ← `_meta.claudeCode.toolResponse` is an object **and** either
  `isAsync === true` or `status === "async_launched"`. Either alone is enough;
  the capture carries both, and requiring both would make one adapter tweak
  silently disable the fix.
- `parentToolCallId` ← `_meta.claudeCode.parentToolUseId`, when a non-empty
  string.

Every read goes through the same `isRecord` / `str` guards
`acp-update-model.ts` already uses. A field the parser cannot read is omitted,
never defaulted — so "absent" is one thing, not three (R5).

`_meta` stays off `AgentToolCall` as raw data; this module is the quarantine.

### `parseToolCall` (changed)

Spreads the facts in alongside the existing conditional spreads, same
"omit what the wire did not carry" rule as every other field:

```ts
...(facts.subagent !== undefined ? { subagent: facts.subagent } : {}),
...(facts.handedOff !== undefined ? { handedOff: facts.handedOff } : {}),
...(facts.parentToolCallId !== undefined
  ? { parentToolCallId: facts.parentToolCallId } : {}),
```

### `AgentToolCall` (changed — public surface)

The three fields from the proposal, verbatim in intent. Each is a **durable
fact about one frame**, settled at parse time and never revised; liveness is
deliberately not a field, because a transcript row is history.

### `ToolEntry` / `applyUpdate` (changed)

`ToolEntry` (`transcript-model.ts:63`) gains the same three optional fields.
`applyUpdate`'s patch branch (`transcript-model.ts:389`) accumulates them with
the **existing** "undefined means unchanged" rule it already applies to
`rawInput`:

```ts
subagent: call.subagent ?? prev.subagent,
handedOff: call.handedOff ?? prev.handedOff,
parentToolCallId: call.parentToolCallId ?? prev.parentToolCallId,
```

This, and only this, is what makes frames 12 and 19 and 20 add up to one row
that knows it is a subagent dispatch and knows it was handed off. It is the
reducer that is stateful, not the parser (R1, R2).

`closeDanglingTools` needs no change: a handed-off row's status is already
`completed`, so the dangling sweep never touches it. Worth a comment where it
would otherwise look like an oversight.

## Data flow

```
session/update frame
  → toSdkUpdate (acp-sessions-service.ts)
      → parseToolCall (acp-update-model.ts)
          → delegatedWorkFacts (chat-delegated-work.ts)   ← vendor quarantine
      → AgentSessionUpdate.toolCall: AgentToolCall         ← public surface
  → panel
      → applyUpdate (transcript-model.ts)                 ← facts accumulate
      → ToolEntry
      → foldToolRuns → AcpChatPanel row                   ← rendering
```

## Rendering

### The dispatch row

- Title: `Agent(<title>)` for `subagent`, built from the row's own title (which
  the reducer has already relabelled from `"Task"` to the streamed description).
- `handedOff` suppresses the settled treatment. The existing `isRunning` check
  (`AcpChatPanel.tsx:607`) keys the `WaveText` ripple on `pending` /
  `in_progress`; a handed-off row is neither, so it must be handled as its own
  third state rather than by widening `isRunning` — the ripple means "this call
  is running", and the dispatch is not.
- No duration, no success badge, no completion affordance (R1).

### A delegated call

Rendered **in place, visually nested, never relocated** — see "Two decisions
this proposal left open" below.

- Indented, and labelled with the dispatch it belongs to, resolved by looking
  up `parentToolCallId` among the transcript's tool entries.
- A delegated call whose dispatch is not in the transcript (a journal replay
  that starts mid-delegation) renders as an ordinary call rather than claiming
  a parent it cannot find.

**Amended during implementation.** "Looking up `parentToolCallId` among the
transcript's tool entries" cannot be done per row: a row's props are what the
panel's row memos compare, and a lookup needs the whole `entries` array, whose
identity changes on **every streamed chunk**. Passing it down would defeat
`TranscriptRow` and `TranscriptTurn` for the entire transcript, on every frame.

So the lookup is a **whole-transcript projection** instead — `DelegationView`
(`{ dispatchTitles, delegatedCounts }`), built by `delegationView(entries)` and
handed to every row on the existing `ToolRowState`. Its identity is held stable
by `delegationSignature(entries)`, a cheap string that changes only when a
dispatch or a delegated call actually appears. Same resolution (by id, never by
position), same fallback, and the memoization survives. The count the design
wanted on the dispatch row falls out of the same projection rather than needing
a second pass.

### `foldToolRuns` (changed)

A dispatch and any delegated call break the run, exactly as a diff-producing or
failed call already does (`transcript-model.ts:596`). Delegated work is the
thing the user asked to be able to see; folding it into `"14 Shell · 3 Read"`
would hide it. One added clause in the existing predicate (R3).

### The aggregate line

One line, in the panel's own chrome rather than the entry stream — it is live
derived state, and `NoticeEntry` is for history. Text:
`Waiting for 1 background agent to finish` / `…for N background agents…`.

## Two decisions this proposal left open

Both are flagged for review; both are resolved conservatively, in the direction
of saying less rather than saying something false.

### 1. What makes the aggregate decrement

The proposal says the aggregate holds "while any dispatch has no terminal
signal" and that it "decrements" — but its own findings establish that **no
terminal signal exists**: nothing revisits the dispatch, and `agentId` appears
nowhere else. Taken literally, the count would never decrement and the line
would be permanently stuck.

**Resolved:** a dispatch is outstanding from its hand-off until **the host says
the session is no longer working**. The line renders when at least one dispatch
in the transcript is `handedOff` _and_ the session's `AgentInfo.activity` is
`"working"`; it is absent otherwise. That reuses the only "nothing is running"
determination that exists — the turn-end marker plus `TURN_QUIESCENCE_MS`
fallback in `chat-turn-signals.ts`, which is already what the tab badge
trusts — instead of inventing a second timer.

Known imprecision, in the safe direction: in the regime where the parent turn
ends while the subagent is still running, the line hides during the gap until
the `task-notification` turn starts. That is an **undercount** — the panel goes
quiet about work that is still happening — not a false claim that work
finished. The alternative (hold the line across idle) would assert running work
on no evidence, and would leave it stuck forever in any session that ends while
a dispatch is outstanding.

### 2. Nesting vs. relocation for delegated calls

The proposal says `parentToolCallId` lets the panel "group them under it". Taken
as physical relocation, that fails in the second turn regime: delegated calls
arriving in a later turn would have to be moved across a turn boundary, and
`groupTurns` (`transcript-model.ts:513`) models a turn as a **contiguous slice**
of `entries`. Relocating entries between turns would corrupt that invariant for
the whole transcript, not just these rows.

**Resolved, then revised on Dave's review of the running app (2026-10-07).**

The first resolution — render in document order, indented, labelled with the
dispatch — was wrong in practice, and the live app showed why. With seven
subagents dispatched at once, their calls interleave: the first agent's reads
landed four rows below a _different_ agent's dispatch, and the only thing
distinguishing them was an attribution label truncated to `Summarize tasks ex…`.
It did not merely fail to group; it read as **wrong attribution**.

The mistake was in the reasoning, not the evidence. "Relocating entries between
turns would corrupt `groupTurns`" is true, but it over-generalised to "never
relocate". Reordering **within one turn** is a different operation, and the
panel already does exactly that in `foldToolRuns` — a render-time projection
over `turn.rest` that reorders nothing in `Transcript.entries`.

**So delegated calls are gathered under their dispatch, per turn.**
`groupDelegatedCalls` runs ahead of the run-folding on the same slice and emits
a `DelegatedGroupEntry` (dispatch + its calls) where the dispatch appeared.
`groupTurns` is untouched; the contiguous-slice invariant is never crossed.

The cross-turn regime keeps the original behaviour as its fallback: a call whose
dispatch is not in the same turn renders in place with its attribution label,
and the block it belongs to shows a count instead ("this agent made N calls,
shown later"). That is also what a journal replayed from mid-delegation gets.

**Presentation** follows `ToolGroupEntry` (Dave's call): a caret header that
discloses its members, last `TOOL_GROUP_INLINE_COUNT` inline when collapsed. The
dispatch row _is_ the header, so it trades its own Input/Output disclosure for
this one — the right trade, since a dispatch's `rawInput` is the subagent's
prompt and its `rawOutput` is the vendor's "Async agent launched" blurb, which
the agent is explicitly told not to surface. The header drops the kind label and
uses Silo's agent glyph: every agent probed reports a dispatch as kind
`"think"`, which would otherwise put a lightbulb and the word "Think" on the row
that started another agent.

## Persistence

None of its own. The three fields ride the **transcript journal** (RFC 0042)
because the journal stores raw `session/update` frames, so a replay re-derives
them through the same parser — no migration, and no new on-disk shape. Worth one
test: seeding a transcript from the captured frames reproduces the same
`ToolEntry` facts as applying them live.

## Error handling

| Failure                                          | Handling                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `_meta` missing / not an object                  | All three facts absent; today's rendering                                                     |
| `_meta.claudeCode` not an object                 | Same                                                                                          |
| `toolResponse` a string / array / `null`         | Same — guarded by `isRecord`                                                                  |
| `subagent` present but not `true`                | Treated as absent, not falsy-coerced                                                          |
| `parentToolUseId` present but empty / non-string | Absent                                                                                        |
| Delegated call whose dispatch is absent          | Renders as an ordinary call                                                                   |
| Adapter stops sending these markers entirely     | Feature silently reverts to today's behaviour — the degradation path _is_ the error path (R5) |

## Testing strategy

Per `.agents/skills/silo-testing/SKILL.md`: co-located Vitest, pure logic, no
`@testing-library/react`.

- `chat-delegated-work.test.ts` — the recognised shapes, driven from the
  **actual frames** in the committed capture rather than hand-written literals,
  plus the full malformed-shape table above.

  **Amended during implementation:** the frames are **copied verbatim** out of
  the capture into the test file (with the capture path and 1-based line number
  named per constant), not read off disk at test time. Reading them live would
  make a unit test depend on `scratchpad/` still existing, which is the one
  directory in the repo whose name promises it won't. The bytes are still the
  real wire, which is the property the design was after; what changes is who
  owns them. Same for the `AgentToolCall`s in `transcript-model.test.ts`, which
  additionally cannot reach the host's parser at all — that is the package
  boundary working as intended.

- `acp-update-model.test.ts` — `parseToolCall` surfaces the three fields, and
  omits each when the wire did not carry it.
- `transcript-model.test.ts` — the accumulation case is the important one:
  replay frames 12 → 16 → 19 → 20 and assert the resulting `ToolEntry` is
  `subagent`, `handedOff`, and still not rendered as settled. Plus:
  `parentToolCallId` attribution across a turn boundary; `foldToolRuns` breaking
  on a dispatch and on a delegated call; `closeDanglingTools` leaving a
  handed-off row alone.
- Aggregate-count helper extracted as a pure function over
  `(entries, activity)` so it is testable without mounting the panel — both
  turn regimes, zero/one/many, and the idle-clears case.

## Constraints and existing decisions

- **ADR 0004** — the public `@silo-code/sdk` is types-first. These are three
  optional type fields, which is exactly the shape that surface takes.
- **ADR 0030** — the host owns indicator glyph, motion and colour, and
  explicitly rejected a settled look as an `Activity` kind. Hence no tab
  indicator here, and if one is ever wanted, a count rather than a colour.
- **ADR 0045** — this planning package is ephemeral; it collapses back to one
  curated `0055-chat-async-tasks.md`.
- **RFC 0038 phase 3.8** — "everything a Chat UI must draw is a modelled
  field". These three fields are that rule applied to delegated work; the point
  of the change is that the panel must _not_ reach into `raw._meta`.
- **RFC 0042** — the transcript journal stores raw frames, which is why
  persistence is free here.
- **`AGENTS.md` → Self-documentation** — new public SDK symbols carry the full
  `silo-docs-sync` workflow in the same change (R6).
- **The CSS surface (ADR 0017)** — any new styling for the handed-off row, the
  nesting indent, or the aggregate line uses design tokens only. No hard-coded
  colours, fonts, or px sizes.
- **Tooltips** — if the handed-off row or the aggregate line gets a hover hint,
  it uses the SDK `Tooltip`, never `title`.
- **Stability caveat, carried from the proposal.** `async_launched`, `isAsync`
  and `parentToolUseId` appear nowhere in the adapter's own source — it types
  `toolResponse?: unknown` and forwards the CLI's internal JSON verbatim. This
  is a dependency on the `claude` binary's shape, versioned by nothing, and the
  least stable surface in the design. That is the whole reason R5 exists and
  the whole reason the reads are quarantined in one module.
