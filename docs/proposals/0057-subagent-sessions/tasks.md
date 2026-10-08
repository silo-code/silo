# Tasks — 0057. Subagent sessions

Ordered. Groups 1–3 are inert: every frame still carries the one parent session
id until group 5 advertises the capability, so the whole routing change can be
reviewed and landed without changing what anyone sees. Group 5 comes **after**
rendering on purpose — advertising before attribution renders would put a
subagent's prose into the parent's transcript unlabelled.

## 1. Carry the session id (inert)

- [x] `acp-jsonrpc.ts`: widen `AcpClientCallbacks.onUpdate` to
      `(update, sessionId)`, read `params.sessionId` defensively in the
      notification dispatch.
- [x] Update the no-op `onUpdate` in `probe-chat-config-options.ts` and any
      test doubles.
- [x] `acp-transport.ts`: key `makeChunkGrouper`'s run state per session id;
      keep `seq` connection-wide; scope run-breaking resets per session.

## 2. Vendor quarantine (inert)

- [x] Add `delegationEvent()` to `chat-delegated-work.ts` — both lifecycle
      kinds, the closed `state` set, absence for anything unrecognised.
- [x] Add generation normalisation (`<id>:generation:N` → `<id>`) as a shared
      helper in that module.
- [x] Extend `delegatedWorkFacts` to re-source `subagent` and `subagentId` from
      `toolResponse.agentId` and the title from `toolResponse.description`.

## 3. Public surface + projection (inert)

- [x] SDK: `AgentDelegation`, `AgentDelegationState`,
      `AgentSessionUpdate.subagentId`, `AgentSessionUpdate.delegation`,
      `AgentToolCall.subagentId` — TSDoc with `@public` / `@category`, barrel
      re-export.
- [x] `acp-update-model.ts`: project `delegation` and the tool call's
      `subagentId`.
- [x] Run the `silo-docs-sync` workflow: `pnpm docs:api`, the roadmap entry, and
      the `ctx`/theming pages if any mention the update shape.
- [x] `docs/domain-language.md`: add the terms this change introduces
      (subagent / delegated worker, the parent↔child session relationship) or
      sharpen the existing delegated-work entry.

## 4. Routing (inert)

- [x] `acp-sessions-service.ts`: track `children`, classify each frame as
      own / child / unknown, register a child from `subagent_spawned`.
- [x] Set `subagentId` on child frames; journal and dispatch them to the parent.
- [x] Keep turn boundaries, tool-call flight and activity driven by the
      parent's own frames only.
- [x] Warn once per unknown session id to the Agents channel; log once when the
      first child frame routes (the runtime signal that the opt-in registered).

## 5. Rendering

- [x] `transcript-model.ts`: per-subagent state from `delegation` events,
      last-write-wins on the normalised id.
- [x] Dispatch rows render a terminal state, distinguishing `completed` from
      `failed` / `cancelled` / `disconnected`; the state is permanent.
- [x] Turn `delegatedDispatchNotice` into a countdown (outstanding =
      dispatched − finished, `undefined` at zero) and rewrite its doc comment —
      it currently argues at length that a countdown is impossible.
- [x] Attribute a child's `agent_message_chunk` into its delegated group;
      never render it as the parent's own prose.
- [x] Panel styling for the new states via design tokens only; any hover hint
      uses the SDK `Tooltip`, never `title`.

## 6. Advertise the capability (the only behaviour-changing commit)

- [x] Add the AIR `_meta` block **inside `initialize`'s `clientCapabilities`**
      (`nativeSubagentSessions` only — not `asyncTasks`). ~~both `initialize`
      and `session/new`~~ — corrected after the runtime test; see the note
      below and `design.md`.
- [x] Unit-test the advertised object against the adapter's own gate, passing
      it the whole `clientCapabilities` so the test fails on placement too.
- [x] Confirm nothing reads `sessionCapabilities.subagents` as confirmation of
      our opt-in.

## 7. Decisions

- [x] Write the ADR recording that Silo advertises a vendor protocol extension
      (AIR) and parses its update kinds through the same quarantine — the
      extension of ADR 0056 from a passive `_meta` read to an active opt-in.

## Tests

- [x] `acp-transport.test.ts` — per-session grouping, cross-session id
      uniqueness, run breaks, no-session-id fallback.
- [x] `acp-jsonrpc.test.ts` — session id delivery and tolerance; AIR gate.
- [x] `chat-delegated-work.test.ts` — `delegationEvent`, normalisation, closed
      state set, re-sourced facts, every degradation shape.
- [x] `acp-update-model.test.ts` — `subagentId` / `delegation` projection.
- [x] `acp-sessions-service.test.ts` — classification, child frames not driving
      the parent's turn, spawn-then-child ordering, unknown-id warning.
- [x] `transcript-model.test.ts` — countdown behaviour, terminal permanence,
      child prose attribution, capability-off path unchanged.
- [x] `chat-session-journal.test.ts` — child frame journaled into the parent's
      file and replayed; pre-change journal still replays.

## Verification

- [ ] Re-run `scratchpad/acp-probe/subagent-capability-2026-10-07.mjs` against
      the shipped advertisement and confirm the capture still matches what the
      design reads.
- [ ] Runtime check in the dev app: dispatch two background agents, confirm the
      notice counts down, each row reports its own finish, and child prose is
      attributed — then restart and confirm the replay shows the same.
- [ ] Every requirement in `requirements.md` met or explicitly noted as not.
- [ ] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, and `pnpm lint` pass.
- [ ] Durable decisions recorded as ADRs (group 7).
- [ ] Proposal collapsed to a single curated `0057-subagent-sessions.md` with
      `status: implemented`, index row repointed.

## Notes from implementation

Two things done that the plan did not name, both inside the files it did:

- **`DelegatedGroupEntry.calls` → `work`,** widened to
  `(ToolEntry | MessageEntry)[]`. A worker's forwarded prose has to render
  inside its block, and it interleaves with the worker's own calls — the
  capture has the worker explaining itself _after_ backgrounding a shell. Two
  parallel lists would have lost that order, which is the order a reader needs.
  Render-time projection only, internal to the panel; no SDK surface moved.
- **Replaced two literal NUL bytes in `delegationSignature`** with `\0`
  escapes — same string value, but the raw bytes made `transcript-model.ts`
  register as binary, so `grep` silently returned nothing for every term in a
  953-line file. Fixed in passing because the signature is code this phase
  extends, and because the repo's own guidance tells agents to grep.

One design correction is recorded in `design.md` under "`agents-chat-panel` —
rendering": child _prose_ cannot be grouped by `parentToolCallId`, because that
is a field of `AgentToolCall` and a message frame has none. The
`subagentId` → dispatch-row match is the only route, and is sufficient.

## Runtime failure found after the first implementation

Dave ran the dev app against a real backgrounded subagent and the notice never
cleared. The screenshot was decisive: the dispatch row still read `handed off`
rather than a terminal badge, so the panel had received no `delegation` event
at all — the countdown was fine, the finish signal never arrived.

**The opt-in was never registered.** The AIR block was sent at the top level of
`initialize`'s params; the adapter reads it from
`clientCapabilities._meta.jetbrains.air` and nowhere else. Correctly shaped,
one level too high, silently ignored — so `NativeSubagentRuntime` was
constructed disabled and every `subagent_*` emission short-circuited on
`if (!this.enabled) return`. The app behaved exactly as it did before this
change, which is the degradation ADR 0057 condition 1 promises and condition 2
is supposed to make _visible_.

Condition 2 did not catch it because the test was handed the already-extracted
`_meta` block and asked "is this block well-formed?" — which it always was. The
test now mirrors `clientSupportsAirCapability` properly: same argument, same
`._meta` descent, plus a case asserting the gate _rejects_ a block placed where
the original one was. Confirmed by reverting the fix and watching two tests
fail.

Also dropped the `session/new` advertisement: the adapter reads AIR only from
`initialize`, and `session/new`'s `_meta` only for `claudeCode.options.resume`.

Still unverified at runtime — the app needs a rebuild before the fix is live.

## Second runtime failure: the agent's sentence split in two

With the opt-in fixed, delegation rendered correctly — `completed` badge, the
worker's calls in their block, the notice clearing. But the agent's own
sentence came apart: _"Agent is running. I'll get you the"_ / gap / _"summaries
when it completes."_

`applyUpdate` merged a streamed chunk only into the **immediately preceding
entry**. That was equivalent to the documented rule ("same role and the same
`messageId`") right up until this change, because nothing could land between
two of one session's chunks. Now a worker's rows do — and they are _relocated_
into their dispatch's block at render time, so they sit between the agent's
chunks in `entries` while appearing nowhere between them on screen. Hence a
break with a visible gap and nothing in it.

The fix is not "merge by id anywhere": a tool call the agent made itself still
has to end the run, which is what the existing test
`ends a text run at a tool call` protects. The rule is about the **column** —
walk back over the entries that will be relocated, and judge the run by the
first one that stays put. `isDelegatedWork` is that predicate, and it
deliberately excludes the dispatch row, which heads its block and stays in the
flow.

A pleasing consequence: the same rule applies inside a worker's block, where
the worker's own call does sit between its prose chunks and correctly breaks
_its_ run. One rule, both columns.

Six regression tests; three of them fail against the previous reducer.

## Rendering refinements (Dave, 2026-10-08)

Three asks against the working build, all inside group 5:

- **The dispatch row stands out.** It carries the transcript's full text
  contrast instead of the quieter tool-row grey, and the `Agent` kind is
  bolded while the task stays quiet — a dispatch is another agent's whole turn
  in one row, not a Read. The label is structured markup now rather than one
  `Agent(…)` string; `dispatchLabel` survives for the flat spelling.
- **A finished block collapses completely**, to its header plus a status row.
  Keyed on the reported outcome, _not_ on the dispatch's own status — that
  settled at the hand-off and says nothing about the work. An agent that never
  reports a finish therefore never auto-collapses, which is the right way to be
  wrong: absence is not a finish (ADR 0057).
- **The status row** is `delegatedSummaryLabel` — `"14 tool calls · expand to
see agent output"`. Counts calls only; a worker's prose is uncountable in any
  way worth showing and is what "agent output" already refers to. A worker that
  only answered gets the bare "expand to see agent output" rather than a
  "0 tool calls" that reads as though it did nothing.

## Hover and collapse refinements (Dave, 2026-10-08)

- **Hover highlights the toggle, not the line.** The dispatch header and the
  folded tool-run header were the last two rows still washing their full width
  on hover; ordinary tool rows had moved to a chip behind the glyph long ago
  (Dave's earlier call). Both now follow that pattern. The whole header stays
  clickable — it just doesn't light up to say so.
- **The chip has to sit on a wrapper, not on the glyph.** The first attempt put
  `::before` on the `<svg>` itself, where it does not render — so the highlight
  was invisible rather than subtle. `.acp-chat__tool-icon-stack` had always
  worked for exactly this reason: it is a span around the icon. Both carets now
  have a `-caret-slot` wrapper.
- **The header and its status line are one unit.** The status line moved out of
  the body and into the header as plain text, so the two share one hover region
  and one click target instead of highlighting independently. It also stops
  being a `<button>` nested inside a `role="button"`.

## Folded tool runs collapse too (Dave, 2026-10-08)

The same collapse-when-done treatment, applied to the ordinary folded tool-run
group so the two blocks behave alike: a two-line header (breakdown + status
line) as one hover/click unit, and no rows at all once every call has settled.

`toolGroupSettled` asks {@link isToolRunning} of every member rather than
inventing a second notion of "finished" — that question already has one owner.

On the summary: the header already reads `"6 Edit · 2 Read · 1 Shell"`, so
repeating a total there would be arithmetic the reader can do. The status line
says the one thing the breakdown cannot — the **total**, so a reader knows what
expanding will cost.

It deliberately says nothing about failures. The first version counted them,
on the reasoning that a collapsed run hiding a failure hides the row worth
noticing. **That branch is unreachable** (Dave caught it): `foldToolRuns`
breaks the run at any call ending `"failed"`, so a failed call is never inside
a group — the failed row already renders in full, outside it, which is a
stronger guarantee than a count behind a collapsed header. A test pins that
split rather than asserting the absent string, so the silence stays correct
only as long as the fold keeps its rule.

### Correction: "settled" is not a one-way signal

Collapsing a folded run on "every call has settled" made it flicker — the
agent pauses, the run settles, the block collapses; its next call joins that
same run and the block re-opens; repeat (Dave, 2026-10-08). The subagent block
never had this because a worker's terminal state genuinely only arrives once.

The fix is structural rather than status-based. `ToolGroupEntry.closed` says
**nothing more can join this run** — something already follows it, so
`foldToolRuns` would start a new run for the next call. That only ever goes
false → true, because the entry that closed it never goes away. In practice the
closing entry is the agent's own reply, which is exactly the rule Dave asked
for.

`toolGroupCollapsed` requires `closed` **and** `settled`, and each rules out a
different wrong look: without `closed` the block flickers; without `settled` a
closed run containing a call still in flight would collapse over a live
spinner, which is possible because `applyUpdate` patches a row in place
wherever it sits.

A past turn that simply ended on tool calls stays open. That is the honest
reading — nothing ever concluded it — and the common agent shape ends a turn
with prose anyway.
