---
status: draft
created: 2026-10-06
---

# 0055. Delegated work in a Chat session

> **Revised 2026-10-06**, after a review and a probe
> (`scratchpad/acp-probe/subagent-finish-2026-10-06.mjs`) refuted most of the
> first draft. The capability design is gone — advertising any subagent
> capability today **deletes** the transcript row this proposal renders, and
> Silo's update handler cannot route child sessions. What remains is the part
> that survived: the dispatching row lies, and should stop.

## Summary

When a Chat agent hands work to a subagent, the transcript says the work is
**done** while it is still running. The dispatching tool call settles
`completed` about 0.4s after the hand-off, so a session with minutes of
delegated work left reads as finished. This proposes making that row tell the
truth, and showing how much delegated work is outstanding — using only frames
Silo already receives, with no capability negotiation.

Backgrounded **shells** are explicitly out of scope: the only source for them is
a vendor capability that is blocked on work this proposal does not do. See
"Out of scope".

## Motivation

Dave, 2026-10-06: _"i'm not seeing any indication of a shell or sub-agent
running and i would like to."_

Recorded from a live session the same day:

```jsonc
// the dispatch — note the subagent marker
{"toolCallId":"toolu_01NJY3G4…","sessionUpdate":"tool_call","title":"Task",
 "kind":"think","_meta":{"claudeCode":{"toolName":"Agent","subagent":true}}}
// …title streams in as the agent fills its arguments
{"toolCallId":"toolu_01NJY3G4…","title":"Sleep then reply",
 "rawInput":{"description":"Sleep then reply","run_in_background":true}}
// the hand-off
{"_meta":{"claudeCode":{"toolResponse":{"isAsync":true,"status":"async_launched",
  "agentId":"a23be9bfedaa92a67"}}}}
// …and the row goes grey, with the subagent still working
{"toolCallId":"toolu_01NJY3G4…","status":"completed"}
```

`status: "completed"` sits beside `status: "async_launched"` in the same call.
Silo renders the first and never sees the second, because `parseToolCall`
(`acp-update-model.ts:106`) drops `_meta`.

The Claude Code CLI renders the same session honestly:

```
● Agent(Sleep then report finished)
  └ Backgrounded agent (↓ to manage · ctrl+o to expand)
✳ Waiting for 1 background agent to finish
```

## What the wire gives us

All verified against the pinned adapter (`claude-agent-acp@0.75.1`) and the
committed probe capture, not against a write-up.

**Capability-free, on the ordinary tool-call stream:**

- `_meta.claudeCode.subagent: true` on the dispatching call — explicit, no
  inference.
- `_meta.claudeCode.toolResponse` with `isAsync` / `status: "async_launched"` —
  the hand-off.
- `title`, streaming `"Task"` → the agent's own description.
- **`_meta.claudeCode.parentToolUseId` on every tool call the subagent makes**,
  pointing at the dispatch. This is the mechanism the first draft dismissed as
  "indirect"; it is in fact live, per-call attribution for the whole delegated
  lifecycle, and it is what makes this proposal work.

**Not available at all:** nothing revisits the dispatching call. The probe
confirms across four runs that no second `tool_call_update` arrives on that
`toolCallId`, and the `agentId` appears nowhere else. There is no duration
anywhere either — the adapter's own `subagent_state_update` carries exactly
three fields (`sessionUpdate`, `subagentSessionId`, `state`), and canonical
`subagent_update`'s `IdleStateUpdate` carries usage and a stop reason. The
CLI's `finished · 46s` is the CLI timing itself.

**Both turn regimes occur, and a design must handle both.** In the probe's
captures the parent's `session/prompt` stayed open 57.5s past the hand-off. In
two Silo sessions on the same adapter version, also capability-free, it resolved
mid-flight and the remaining child calls arrived in a later agent-initiated turn
(journal `e88de454-…`: child call at line 49, `origin: human` end at 52, more
child calls at 53 and 59, `origin: task-notification` end at 96). Whether the
parent stops after dispatching looks like a model decision, not a protocol
guarantee — those sessions ran opus; the probe takes the CLI default.

**Stability caveat, stated plainly.** `async_launched`, `isAsync` and `agentId`
appear nowhere in the adapter's own source; it types `toolResponse?: unknown`
and forwards the CLI's internal tool-result JSON verbatim. This is therefore a
dependency on the `claude` binary's shape, versioned by nothing — less stable
than an adapter contract, and the least stable surface in this design. The
parser must degrade to today's behaviour on an unrecognised shape.

## Design

### Parsing — a pure module

`chat-delegated-work.ts`, beside `chat-turn-signals.ts` and following the same
shape: wire in, meaning out, no state, tested against the committed capture. It
owns the vendor quarantine (`_meta.claudeCode`) and returns nothing at all for a
shape it does not recognise.

### Public surface — three parse-time facts on `AgentToolCall`

```ts
/** This call dispatched a subagent. */
readonly subagent?: boolean;
/** The call reported a status, but only handed its work off to run
 *  elsewhere — the status describes the dispatch, not the work. */
readonly handedOff?: boolean;
/** The id of the dispatching call this one was made on behalf of. */
readonly parentToolCallId?: string;
```

Each is a **durable fact about one frame**, settled at parse time and never
revised. The first draft's `detached` is dropped: it bundled "this status is a
lie" with "there is live work behind this row", which come apart the moment the
work finishes, leaving a public boolean whose meaning a third party could not
determine.

Liveness is deliberately **not** a field. It is derived state that changes over
time, and a transcript row is history.

Deliberately not exposed: `outputFile` and `agentId`. A path into the agent's
private temp directory is a capability decision, not a field.

New public surface, so this carries the full `silo-docs-sync` workflow.

### Transcript

- A `subagent` call renders `Agent(<title>)`.
- A `handedOff` call **does not render as settled** — it shows as handed off,
  with the agent's description. This is the whole fix.
- `parentToolCallId` attributes each child call to its dispatch, so the panel
  can group them under it and show the delegated work as it happens.
- An aggregate `Waiting for N background agents to finish` while any dispatch
  has no terminal signal.

**Per-row completion is not rendered, and that is deliberate.** With several
dispatches outstanding, nothing on the wire says which one finished. Resolving
by dispatch order would attach a specific agent's name to the wrong finish
whenever they complete out of order — the normal case. The aggregate decrements;
no row claims a completion it cannot prove.

### Indicator, sound, attention — unchanged

The tab indicator reads `AgentInfo` (`deriveTab(a: AgentInfo, …)`), which
carries thirteen scalars and no collections, so it cannot see tool-call data at
all. A session-scoped signal for delegated work does not exist yet, and
inventing one is out of scope here.

"Static blue for delegated work outstanding" from the first draft is dropped
outright. ADR 0030 decided the host owns glyph, motion and colour, and
explicitly rejected adding a settled look as an `Activity` kind; three of the
five existing looks already animate, so motion is not a free channel either. If
an indicator is wanted later, ADR 0030's own precedent points at a **count**,
not a colour.

Sound and attention are untouched. `needsAttention` has one writer and one rule;
a turn starting clears it, so a second writer would wipe exactly the
notification the user wanted.

## Out of scope — and why it is blocked, not deferred

Backgrounded **shells** need AIR `asyncTasks`; richer subagent state needs either
AIR `nativeSubagentSessions` or canonical `clientCapabilities.subagents` (v1
**unstable**, added in schema 1.24.0 on 2026-09-30). All three are blocked on
the same two facts:

1. **Advertising any of them deletes this proposal's row.** With the subagent
   runtime enabled, `route()` returns `null` for control updates and the caller
   drops them — "Native Agent/Task control calls are intentionally not transcript
   tools" (`native-subagents.js`, `acp-agent.js:1888`). Every element designed
   above decorates a row the capability removes.
2. **Silo cannot route child sessions.** `acp-jsonrpc.ts:418` takes
   `params.update` and discards `params.sessionId`; `makeChunkGrouper` keys runs
   on update kind alone. Child traffic would merge into the parent transcript
   unlabelled — worse than the lie this proposal fixes.

So `sessionId`-aware update routing is a **prerequisite RFC**, not a follow-on,
and it is the nested-session design the first draft thought it was deferring.

Note also that the two protocols disagree about what a subagent is: the
adapter's `SubagentState` is terminal (`completed | failed | cancelled |
disconnected`), while canonical `StateUpdate` is `running | idle | …` and says
outright that "Idle does not terminate the child". They are not a shim and its
replacement; they are different models. The first draft's "canonical wins where
present" is also unimplementable — `clientSupportsSubagents` accepts either
signal and emits the draft shape regardless.

## Alternatives considered

**Ship nothing until a capability is usable.** Rejected: the row is actively
wrong today, and the prerequisite RFC is a larger piece of work.

**Resolve rows approximately on the next agent-initiated turn.** Rejected after
review: "approximate but honestly worded" protects the unresolved rows and does
nothing for the one resolved incorrectly, which will carry a specific name. The
aggregate is defensible; a wrong attribution is not.

**Expose raw `_meta` on `AgentToolCall`.** Rejected: `parseToolCall` already
narrows vendor shapes, and raw `_meta` would make every consumer a vendor
parser.

## Decision

Open. One unknown is recorded rather than resolved: what drives the turn-regime
split. Pin the model and re-run the probe to settle it. It does not block
anything here — the transcript fix is correct in both regimes — but it will
matter to any future indicator.
