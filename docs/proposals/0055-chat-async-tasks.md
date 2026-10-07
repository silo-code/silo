---
status: implemented
created: 2026-10-06
---

# 0055. Delegated work in a Chat session

## Summary

When a Chat agent handed work to a subagent, the transcript said the work was
**done** while it was still running: the dispatching tool call settles
`status: "completed"` about 0.4s after the hand-off, so a session with minutes
of delegated work left read as finished. The row now tells the truth, the calls
each subagent makes are gathered under the dispatch that started them, and the
panel says how many background agents the current exchange dispatched.

Nothing moved on the host ↔ extension boundary beyond three optional fields on
the public `AgentToolCall` — `subagent`, `handedOff`, `parentToolCallId`. No new
`ctx` capability, no privileged surface, no capability negotiation with the
agent. The vendor `_meta` these facts come from is read in exactly one module,
which is the subject of [ADR 0056](../decisions/0056-vendor-meta-through-one-quarantine.md).

Backgrounded **shells** and a true per-agent countdown are out; both are
reachable but blocked on session routing — see "What is still open".

## Motivation

Dave, 2026-10-06: _"i'm not seeing any indication of a shell or sub-agent
running and i would like to."_

The wire, from a live session the same day:

```jsonc
// the dispatch — note the subagent marker
{"toolCallId":"toolu_01NJY3G4…","sessionUpdate":"tool_call","title":"Task",
 "kind":"think","_meta":{"claudeCode":{"toolName":"Agent","subagent":true}}}
// the hand-off
{"_meta":{"claudeCode":{"toolResponse":{"isAsync":true,"status":"async_launched",
  "agentId":"a23be9bfedaa92a67"}}}}
// …and the row goes grey, with the subagent still working
{"toolCallId":"toolu_01NJY3G4…","status":"completed"}
```

`status: "completed"` sits beside `status: "async_launched"` in the same call.
Silo rendered the first and never saw the second, because `parseToolCall`
dropped `_meta`. The Claude Code CLI renders the same session honestly.

## What the wire gives us

Verified against the pinned adapter (`claude-agent-acp@0.75.1`) and the
committed capture
`scratchpad/acp-probe/captures/frames-2026-10-06T20-05-31-821Z.jsonl`, not
against a write-up. Three facts arrive on **three different frames of one call
id**, which is the shape the whole design turns on:

| Frame | `status`    | `_meta.claudeCode`                                             |
| ----- | ----------- | -------------------------------------------------------------- |
| 12    | `pending`   | `{toolName: "Agent", subagent: true}`                          |
| 13–16 | _absent_    | `{toolName: "Agent", subagent: true}`                          |
| 19    | _absent_    | `{toolResponse: {isAsync: true, status: "async_launched", …}}` |
| 20    | `completed` | `{toolName: "Agent"}`                                          |

Consequences a future change must preserve:

1. **The hand-off and the lie are different frames.** A per-frame parser cannot
   see both — the accumulation is the reducer's job, not the parser's.
2. **`subagent` is not repeated.** It is gone by frame 19.
3. **`_meta` is on the update envelope**, not nested under a `toolCall` object.
4. **`parentToolUseId` is on every call a subagent makes**, pointing at the
   dispatch. Live, per-call attribution for the whole delegated lifecycle — the
   mechanism that makes this feature possible.
5. **Nothing revisits the dispatch.** No second update on that `toolCallId`,
   `agentId` appears nowhere else, and there is no duration anywhere. On the
   capability-free stream there is no finish signal, for any agent, ever.

**Both turn regimes occur and both are handled.** In the probe the parent's
`session/prompt` stayed open 57.5s past the hand-off; in two Silo sessions on the
same adapter version it resolved mid-flight and the remaining child calls
arrived in a later agent-initiated (`task-notification`) turn. Whether the
parent stops after dispatching looks like a model decision, not a protocol
guarantee. What drives the split was never settled — pin the model and re-run
the probe if it ever matters.

## What was built

### Parsing — one vendor quarantine

`packages/extension-host/src/extension-host/agents/chat-delegated-work.ts`,
beside `chat-turn-signals.ts` and the same shape: wire in, meaning out, no
state, no React. `delegatedWorkFacts(update)` is the **only** place
`_meta.claudeCode` is read for delegated work; `parseToolCall` calls it and
spreads the result onto the modelled `AgentToolCall`.

- `subagent` ← `subagent === true`, nothing weaker.
- `handedOff` ← `toolResponse` is an object **and** either `isAsync === true` or
  `status === "async_launched"`. Either alone is enough — requiring both would
  let one adapter tweak silently disable the fix, and the cost of reading one is
  a row that says "handed off" for a call that was.
- `parentToolCallId` ← `parentToolUseId`, when a non-empty string.

Everything is guarded, a field the wire did not carry is omitted rather than
defaulted, and an unrecognised shape yields all three facts absent — which is
byte-for-byte the old rendering. **The degradation path is the error path**, and
that is deliberate: `async_launched`, `isAsync` and `parentToolUseId` appear
nowhere in the adapter's own source (it types `toolResponse?: unknown` and
forwards the CLI's internal JSON verbatim), so this is a dependency on the
`claude` binary's shape, versioned by nothing. It is the least stable surface in
the feature. ADR 0056 is the standing rule this is an instance of.

### Public surface — three parse-time facts

```ts
readonly subagent?: boolean;        // this call dispatched a subagent
readonly handedOff?: boolean;       // the status describes the dispatch, not the work
readonly parentToolCallId?: string; // the dispatch this call was made on behalf of
```

Each is a **durable fact about one frame**, settled at parse time and never
revised. **Liveness is deliberately not a field** — it is derived state that
changes over time, and a transcript row is history. `agentId` and `outputFile`
are on the wire and deliberately not exposed: a path into the agent's private
temp directory is a capability decision, not a field.

An earlier draft had a single `detached` flag. It was dropped because it bundled
"this status is a lie" with "there is live work behind this row", which come
apart the moment the work finishes — leaving a public boolean whose meaning a
third party could not determine.

### Transcript model

`ToolEntry` carries the same three fields, and `applyUpdate` accumulates them
with the existing "undefined means unchanged" rule (`call.x ?? prev.x`) on both
the patch and the append branch. **This, and only this, is what makes frames 12,
19 and 20 add up to one row** that knows it is a dispatch and knows it was
handed off. The reducer is stateful; the parser is not.

`closeDanglingTools` needs no change — a handed-off row is already `completed`,
so the dangling sweep never touches it. Commented in place, since it would
otherwise look like an oversight.

Persistence is free: the transcript journal stores raw `session/update` frames
(RFC 0042), so a replay re-derives the facts through the same parser. No
migration, no new on-disk shape.

### Rendering

- A dispatch renders `Agent(<its own description>)`, with Silo's agent glyph and
  no kind label — every agent probed reports a dispatch as kind `"think"`, which
  would otherwise put a lightbulb and the word "Think" on the row that started
  another agent.
- `handedOff` gets its own row treatment, a **third state** alongside running
  and settled. `isRunning` was deliberately **not** widened: its `WaveText`
  ripple means "this call is running", and a dispatch is not.
- **Delegated calls are gathered under their dispatch, per turn.**
  `groupDelegatedCalls` runs ahead of the run-folding over the same slice and
  emits a `DelegatedGroupEntry` where the dispatch appeared, presented like a
  tool-call group: caret header, members disclosed, last
  `TOOL_GROUP_INLINE_COUNT` inline. `groupTurns` is untouched.
- The cross-turn case (and a journal replayed from mid-delegation) falls back to
  rendering in place with an attribution label, and the dispatch shows a count
  instead.
- `foldToolRuns` breaks a run on a dispatch or a delegated call, exactly as a
  diff-producing or failed call already does. Delegated work is the thing the
  user asked to see; folding it into `"14 Shell · 3 Read"` would hide it.
- Design tokens only; every hover hint is the SDK `Tooltip`.

**Per-row completion is not rendered.** With several dispatches outstanding,
nothing on the wire says which one finished, so resolving by dispatch order would
attach a specific agent's name to the wrong finish whenever they complete out of
order — the normal case.

### The aggregate line

`N background agent(s) dispatched`, in the panel chrome, scoped to the current
exchange (dispatches since the last user message), cleared by the next prompt.
Static agent glyph, and a tooltip carrying the caveat that Silo is not told when
a background agent finishes.

**Two earlier resolutions were wrong, and the running app is what showed it.**
Recording both, because each is the kind of mistake the next change here could
repeat:

1. **Gating on liveness.** The line was `Waiting for N background agents to
finish`, rendered only while `AgentInfo.activity === "working"`. It flickered
   off while subagents were demonstrably still running: between the parent's
   turn ending and the next notification turn, the session reads idle. And
   "waiting to finish" promised a countdown the wire cannot deliver — with no
   finish signal the count can only ever go up. A statement about what was
   _dispatched_ does not stop being true while the session is quiet, so the line
   is now ungated and says only that. The count is of dispatches
   (`handedOff && subagent` — `handedOff` alone is agent-agnostic on the public
   surface and a backgrounded shell is the next thing expected to set it).
2. **Refusing to relocate delegated calls.** "Relocating entries between turns
   would corrupt `groupTurns`' contiguous-slice invariant" is true, but it
   over-generalised to "never relocate". With seven subagents dispatched at
   once their calls interleave, and rendering in document order put one agent's
   reads four rows below a _different_ agent's dispatch — it read as wrong
   attribution, not merely as a failure to group. Reordering **within one turn**
   is a different operation, and `foldToolRuns` already does exactly that as a
   render-time projection.

One implementation amendment worth keeping: resolving `parentToolCallId` cannot
be done per row, because a lookup needs the whole `entries` array, whose
identity changes on every streamed chunk — passing it down would defeat the row
and turn memos for the entire transcript, on every frame. So the lookup is a
whole-transcript projection, `delegationView(entries)` → `{ dispatchTitles,
delegatedCounts }`, with its identity held stable by `delegationSignature(entries)`
— a cheap string that changes only when a dispatch or a delegated call actually
appears. Resolution is still by id, never by position.

### Indicator, sound, attention — untouched

The tab indicator reads `AgentInfo`, which carries thirteen scalars and no
collections, so it cannot see tool-call data at all. ADR 0030 decided the host
owns glyph, motion and colour and explicitly rejected a settled look as an
`Activity` kind; three of the five existing looks already animate, so motion is
not a free channel either. If an indicator is ever wanted, ADR 0030's own
precedent points at a **count**. `needsAttention` has one writer and one rule,
and a turn starting clears it — a second writer would wipe exactly the
notification the user wanted.

## The capability spike, and what it changes

A spike on 2026-10-07 (`scratchpad/acp-probe/subagent-capability-2026-10-07.mjs`,
four committed captures) tested whether a per-subagent finish signal is
reachable. It is — but not from here yet.

**The canonical opt-in does not work, and fails silently.** Three captures
advertised `clientCapabilities.subagents = {}` and observed nothing. That is
not evidence about the capability: the field is stripped by the SDK's
`zClientCapabilities` Zod schema before `clientSupportsSubagents` ever reads it
([claude-agent-acp#1195](https://github.com/agentclientprotocol/claude-agent-acp/issues/1195)),
so those runs tested a request that never arrived. Two traps worth keeping:
a capability-off capture and a silently-failed opt-in are **indistinguishable**
(hence the probe's `assertOptIn`), and the adapter echoing
`sessionCapabilities.subagents: {}` in its `initialize` result is the **agent's
own** advertisement — it confirms nothing about what the client sent.

**The AIR opt-in works** (`_meta.jetbrains.air` with `nativeSubagentSessions` on
both `initialize` and `session/new`; read
`report-cap-air-bg-2026-10-07T19-35-21-238Z.json`):

| Belief before the spike                                  | Observed under AIR                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Advertising deletes the dispatch row                     | **Wrong** — it survives, reduced to one `tool_call_update` with no title               |
| The lifecycle frames give a terminal per-subagent signal | **Right** — `state: "completed"`, keyed by `subagentSessionId`, one 25s after turn end |
| Child work arrives on a child `sessionId`                | **Right** — `childSessionIds: ["a26fef4c40ae0ac1d"]`                                   |

So the central limitation here is **scoped, not permanent**: no finish signal
exists _on the capability-free stream_. That is why the aggregate states
dispatches rather than claiming a countdown.

Cost of the capability path, measured against that capture: `handedOff` and
`parentToolCallId` are unchanged (the latter now points _across_ sessions);
`subagent` must be re-sourced from `toolResponse.agentId`; and
`AgentToolCall.title` loses its source entirely (no opening `tool_call` — use
`toolResponse.description` or `subagent_spawned.name`). All of it lands inside
`chat-delegated-work.ts`. Two gotchas the captures show: `subagent_spawned` and
`subagent_state_update` each arrive **twice** per `subagentSessionId`, so a
consumer must dedupe; and the dispatch the children name lives in the root
session while the children do not.

## What is still open

- **`sessionId`-aware update routing — the prerequisite.** `acp-jsonrpc.ts`
  takes `params.update` and discards `params.sessionId`, and `makeChunkGrouper`
  keys runs on update kind alone. Without routing, a subagent's calls merge into
  the parent transcript unlabelled — worse than the lie this proposal fixed.
  This is a **prerequisite RFC**, not a follow-on, and it gates both a true
  per-agent countdown and richer subagent state.
- **Backgrounded shells are unblocked, and were never part of this.** An
  earlier draft claimed they were blocked on the same two facts; that was
  **wrong**. For a backgrounded shell the adapter _keeps_ the tool call and tags
  it `_meta.air.asyncTasks = { backgrounded: true }`, and
  `async_task_state_update` carries both a `toolCallId` and a terminal `state` —
  no row is deleted and no session routing is involved. It is a far smaller
  piece of work than the subagent path. (`asyncTasks` cannot help _subagents_:
  `taskStarted` sets `ignored = true` for anything with a `subagent_type` or
  `taskType === "local_agent"`.)
- **Re-run `subagent-capability-2026-10-07.mjs`** when the adapter or the
  `claude` CLI moves. "No finish signal" is the premise the aggregate's wording
  rests on, and three documented claims about the adapter turned out wrong when
  actually run.
- **The two protocols disagree about what a subagent is.** The adapter's
  `SubagentState` is terminal (`completed | failed | cancelled | disconnected`);
  canonical `StateUpdate` is `running | idle | …` and says outright that "Idle
  does not terminate the child". They are not a shim and its replacement — they
  are different models, so "canonical wins where present" is not a usable rule.

## Alternatives considered

**Ship nothing until a capability is usable.** Rejected: the row was actively
wrong, and the prerequisite RFC is a larger piece of work.

**Resolve rows approximately on the next agent-initiated turn.** Rejected:
"approximate but honestly worded" protects the unresolved rows and does nothing
for the one resolved incorrectly, which carries a specific agent's name. The
aggregate is defensible; a wrong attribution is not.

**Expose raw `_meta` on `AgentToolCall`.** Rejected — it would make every
consumer a vendor parser and kill RFC 0038's modelled-field rule. See ADR 0056.

## Implementation

Phase: single, shipped 2026-10-07. This proposal commits to nothing further —
the open items above are separate work.

- `packages/extension-host/src/extension-host/agents/chat-delegated-work.ts`
  (new, the quarantine) and `acp-update-model.ts`.
- `packages/sdk/src/agents-service.ts` — the three `AgentToolCall` fields, which
  ride the existing barrel export.
- `packages/extensions-silo/src/agents-chat-panel/` —
  `transcript-model.ts` (`ToolEntry`, `applyUpdate`, `groupDelegatedCalls`,
  `delegationView`, `delegationSignature`, `delegatedDispatchNotice`),
  `AcpChatPanel.tsx`, `acp-chat.css`.
- Docs: `apps/docs/api/agents/sessions.md` → "Delegated work", the roadmap's
  Chat-sessions row, the generated `api/types` reference, and
  `docs/domain-language.md` → Delegated work / Dispatch / Hand-off / Delegated
  call / Delegated-work block.
- Probes and captures under `scratchpad/acp-probe/`.

## Related decisions

- [ADR 0056](../decisions/0056-vendor-meta-through-one-quarantine.md) — a vendor
  `_meta` fact reaches the SDK through one quarantine module. Written out of
  this change; it is the standing rule, where this proposal is the instance.
- [ADR 0004](../decisions/0004-sdk-types-first.md) — the public SDK is
  types-first; three optional type fields are exactly that shape.
- [ADR 0030](../decisions/0030-activity-chrome.md) — the
  host owns indicator glyph, motion and colour; why there is no tab indicator
  here.
- [ADR 0017](../decisions/0017-css-theming-contract.md) — the CSS surface;
  design tokens only.
- [RFC 0038](./0038-acp-agent-sessions.md) phase 3.8 — everything a Chat UI must
  draw is a modelled field.
- [RFC 0042](./0042-chat-session-resurrection.md) — the journal stores raw
  frames, which is why persistence here was free.
