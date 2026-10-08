---
status: implemented
created: 2026-10-08
---

# 0057. Subagent sessions: routing updates by `sessionId`

## Summary

Silo's Chat client used to throw away the `sessionId` on every `session/update`
it received, because every update belonged to the one session that was
prompted. Advertising the adapter's subagent capability breaks that
assumption: a subagent's tool calls and prose arrive under a **child** session
id, carrying the per-subagent finish signal Silo previously could not see.
This change makes `sessionId` a first-class part of the update path —
routing, chunk grouping, journaling and the public update shape — then
advertises the capability and renders what it reports: per-agent completion,
a status line that counts down honestly, and a subagent's own work attributed
to the agent that did it.

## Motivation

[RFC 0055](0055-chat-async-tasks.md) stopped the transcript from claiming a
dispatch had finished when it hadn't. It could not say when the delegated
work **did** finish, or which agent it was, because nothing on the
capability-free stream reports either — the status line counted agents
dispatched and never counted down.

A probe (`scratchpad/acp-probe/subagent-capability-2026-10-07.mjs`) showed
that advertising AIR `nativeSubagentSessions` produces an identified terminal
signal per subagent (`subagent_state_update`, one observed arriving 25s after
the parent's turn had ended), plus the subagent's own tool calls and prose on
a **child session id**. The host could not yet tell one session's updates
from another's, so turning the capability on without fixing that would have
merged every subagent's work into the parent transcript unlabelled — worse
than the imprecision RFC 0055 removed.

Backgrounded shells (AIR `asyncTasks`) want the same plumbing's sibling but
need no session routing — deliberately left out (see Scope). The canonical
ACP protocol is also consolidating this into one `subagent_update` message
(merged upstream, not yet in the published SDK or in `claude-agent-acp`);
designing the host's seam now keeps that eventual switch a parser change
inside the vendor quarantine, not an architecture change.

## Solution

**Carry the session id from the wire to the consumer, and let the consumer
decide what a child means** — the same shape ADR 0050 settled for replay: the
transport reports a fact, it doesn't filter on anyone's behalf.

- `AcpClientCallbacks.onUpdate(update, sessionId)` — `acp-jsonrpc.ts` stops
  discarding `params.sessionId`; a missing or non-string id reads as "the
  connection's own," which is byte-for-byte the pre-change behaviour for an
  agent that never sends one.
- `makeChunkGrouper` (`acp-transport.ts`) keys its synthesized-`messageId` run
  state **per session id** instead of globally, with `seq` staying
  connection-wide so two sessions never mint the same id.
- `acp-sessions-service.ts` classifies every frame as the session's own, a
  known child's, or unknown. A child is registered from `subagent_spawned`
  before its frames can arrive; an unknown session id is dropped and warned
  once rather than ever attributed to the live session. Child frames are
  journaled and dispatched to listeners but **never** drive the parent's turn
  boundary, tool-call flight, or activity signals — a subagent still running
  after the parent's turn ends must not reopen it.
- `chat-delegated-work.ts` (the one vendor quarantine, per ADR 0056) grew
  `delegationEvent()` — reading `subagent_spawned`/`subagent_state_update`
  into a typed `{ subagentId, name?, task?, state }`, generation-id normalised
  at parse time so the lifecycle pair arriving twice per subagent (observed in
  the capture) never double-counts — and re-sources `subagent`/`subagentId`/
  title from `toolResponse.agentId`/`description` for the capability-on
  regime, where the dispatch frame carries no explicit marker.
- The SDK gained `AgentSessionUpdate.subagentId`/`.delegation`,
  `AgentDelegation`, `AgentDelegationState`, and `AgentToolCall.subagentId` —
  all read through the existing `onUpdate` stream, no new `ctx` surface.
- The journal (RFC 0042) needed no schema change: a child's updates ride in
  the **parent's** file with `subagentId` set, so a replay reconstructs the
  nesting from the data rather than from arrival order.
- `agents-chat-panel` renders a per-subagent state map (last-write-wins,
  terminal states permanent across idle/turn-end/replay), an honest countdown
  notice, and a child's prose/tool calls inside its dispatch's delegated
  group. The capability is advertised **last**, after every routing and
  rendering change had already landed and was provably inert.

### Two things worth knowing if you touch this again

- **The AIR `_meta` block must be nested inside `initialize`'s
  `clientCapabilities`, never beside it and never on `session/new`.** The
  adapter's gate (`clientSupportsAirCapability`, `claude-agent-acp` 0.75.1)
  reads `clientCapabilities._meta.jetbrains.air` and only from `initialize`.
  A correctly-shaped block one level too high, or sent with `session/new`
  (whose `_meta` is never consulted for AIR), is silently ignored — the
  capability stays off with no error, every dispatch row sticks on "handed
  off" forever, and the first implementation shipped exactly that way,
  tests-green. The unit test asserting this takes the adapter's own
  `clientCapabilities` argument, not the pre-extracted block, specifically so
  a misplacement fails it.
- **A worker's rows are relocated at render time**, so a child's chunks can
  sit between a parent's own chunks in `entries` while appearing nowhere
  between them on screen. Merging a streamed chunk into "the immediately
  preceding entry" (the pre-change rule) breaks a sentence in two once that's
  possible. `isDelegatedWork` fixes this by judging a run's continuity by the
  first entry that _stays in its column_, not by raw adjacency — the same
  predicate also correctly ends a run inside a worker's own block when the
  worker makes a tool call between its own chunks.

## Decisions

1. **Public field shape — both, split by meaning.**
   `AgentSessionUpdate.subagentId` names _which delegated worker produced this
   frame_; `AgentSessionUpdate.delegation` is the modelled projection of the
   lifecycle messages. Consumers never match on a vendor `kind` string and
   never read `raw`. Per ADR 0056, the fields name meanings, so the eventual
   canonical `subagent_update` is a quarantine-local parser change.
2. **A finished subagent's block is permanent; the notice is not.** A dispatch
   row that has seen a terminal state says so forever — a transcript row is
   history (ADR 0056 point 4). The _notice_ stays scoped to the current
   exchange and counts what is outstanding, so it disappears once every agent
   dispatched since the last user message has finished.
3. **Routing did not ship alone.** It was sequenced first and was inert on its
   own, but the capability was advertised only after rendering existed, so the
   reviewed unit was the whole change.
4. **The AIR dependency is accepted, and is Claude-only in practice.** It
   degrades to absence: with the capability off, or against an adapter that
   stops speaking it, every frame carries the one parent session id and
   rendering is byte-for-byte the pre-change behaviour. Only `claude-agent-acp`
   (checked against the pinned 0.75.1 dist) carries an `air-extension` module
   among the catalog's ACP agents. Recorded as
   [ADR 0057](decisions/0057-advertising-a-vendor-protocol-extension.md),
   extending ADR 0056 from reading vendor `_meta` facts to actively opting
   into a vendor protocol extension.

## Scope

Implemented in:

- `@silo-code/extension-host` — `acp-transport.ts`, `acp-jsonrpc.ts`,
  `acp-sessions-service.ts`, `chat-delegated-work.ts`, `acp-update-model.ts`.
- `@silo-code/sdk` — `AgentSessionUpdate.subagentId`/`.delegation`,
  `AgentDelegation`, `AgentDelegationState`, `AgentToolCall.subagentId`.
- `@silo-code/extensions-silo` — `agents-chat-panel`: per-agent completion,
  the countdown notice, child prose/tool-call attribution, and the collapsed
  "finished" rendering for both delegated-work and ordinary folded tool-run
  blocks.
- [ADR 0057](decisions/0057-advertising-a-vendor-protocol-extension.md).

Deliberately out, for a later proposal:

- **Backgrounded shells** (AIR `asyncTasks` — `async_task_spawned` /
  `async_task_state_update`), which carry a `toolCallId` and need no session
  routing at all.
- **Cancelling, closing, or steering a subagent** via
  `subagent_spawned.capabilities`.
- **Canonical `subagent_update`** — merged upstream, absent from the published
  SDK and from the adapter's runtime; the vendor quarantine is where it lands
  when it arrives.
- The turn-end sound firing once per background notification turn (pre-dates
  this change).

## Alternatives considered

**Do nothing; keep the capability-free design.** Rejected as a permanent end
state — the status line's imprecision is what users actually notice.

**Poll instead of routing.** Rejected on evidence: no ACP request reports
background state, the CLI's own internal signal is never forwarded, and
subagents are explicitly excluded from the async-task lifecycle. The one
remaining mechanism — polling a subagent's private output file for silence —
is the same completion-by-timer guess in a different shape.

**Wait for canonical `subagent_update`.** Deferred, not rejected: merged in
the spec but absent from the published SDK and the adapter's runtime, with no
date. The host-side routing this change needed either way, and makes the
eventual switch cheap.

**One journal file per child session.** Rejected: multiplies files by
subagent count and orphans them when the parent is deleted, for no gain — a
subagent's transcript has no meaning apart from the turn that spawned it.

**Hand `sessionId` to the panel and let it filter.** Rejected: knowing which
session an update belongs to is the host's job: every Chat UI, including
third-party ones, would otherwise reimplement the same routing.
