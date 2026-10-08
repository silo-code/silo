# Design — 0057. Subagent sessions

How the requirements are satisfied. Intent, not a copy of the source. Working
artifact — removed when the proposal collapses.

## Architecture

Three packages, in dependency order:

- **`@silo-code/extension-host`** — all of the routing. The transport
  (`acp-transport.ts`) and the JSON-RPC layer (`acp-jsonrpc.ts`) stop discarding
  `params.sessionId`; the sessions service (`acp-sessions-service.ts`) owns the
  parent↔child map and decides what a child frame means; the vendor quarantine
  (`chat-delegated-work.ts`) owns every AIR and `_meta` read; the update model
  (`acp-update-model.ts`) projects the result onto the SDK shape.
- **`@silo-code/sdk`** — two new `@public` fields on `AgentSessionUpdate` plus
  one new exported type. No new capability on `ctx`; the existing
  `onUpdate` stream carries everything.
- **`@silo-code/extensions-silo`** — `agents-chat-panel` consumes the new
  fields. The panel gains no new host access.

The boundary does not move. A third-party Chat UI gets per-agent completion from
the same modelled fields the first-party panel reads, which is the RFC 0038
promise held for a case the protocol does not cover.

## Components

### `acp-transport.ts` — `makeChunkGrouper`

Today it holds `runKind` / `runId` as connection-wide globals. It becomes a
`Map<string, { runKind, runId }>` keyed by the frame's `params.sessionId`, with
the `seq` counter staying connection-wide so synthesized ids remain unique
across sessions (R2). Frames with no session id share one bucket under a
sentinel key, which is exactly today's behaviour for an agent that omits it.
Run-breaking kinds reset only their own session's entry.

The grouper reads `msg.params.sessionId` — it already receives the whole
`AcpMessage`, so this needs no new plumbing.

### `acp-jsonrpc.ts` — the notification dispatch

`AcpClientCallbacks.onUpdate` becomes
`onUpdate(update: AcpSessionUpdate, sessionId: string | undefined): void`.
Update first, session id second: every existing call site reads the update, and
only the sessions service cares about the id. The dispatch reads
`params.sessionId` defensively (a non-string is `undefined`, not a throw) and
keeps its existing `update?.sessionUpdate` guard.

`probe-chat-config-options.ts` passes a no-op `onUpdate` and needs only a
signature touch.

### `acp-jsonrpc.ts` — the AIR advertisement

One exported constant builds the AIR `_meta` block, carried **inside
`initialize`'s `clientCapabilities`**:

```
clientCapabilities: {
  fs: …, terminal: false,
  _meta: { jetbrains: { air: { version: 1, capabilities: ["nativeSubagentSessions"] } } },
}
```

**Corrected during implementation.** The design said "both `initialize` and
`session/new`", with the block at the top level of each request's params. Both
halves were wrong, and the result shipped tests-green and completely inert —
see the runtime failure recorded below. Verified against the pinned
`claude-agent-acp` 0.75.1 dist:

- `clientSupportsSubagents(this.clientCapabilities)` (`acp-subagents.js`) is
  the only gate, and `this.clientCapabilities` is `initialize`'s
  `request.clientCapabilities` (`acp-agent.js:788`). It delegates to
  `clientSupportsAirCapability`, which does its own
  `capabilities._meta.jetbrains.air` lookup (`air-extension.js`). So the block
  must be **nested inside `clientCapabilities`**; beside it, nothing reads it.
- `session/new`'s `_meta` is read only for `claudeCode.options.resume`. No AIR
  capability is read per-session at all, so the second advertisement was noise.
- It rides in `_meta` rather than the canonical `clientCapabilities.subagents`
  because `zClientCapabilities` is a plain `z.object` and strips unknown keys,
  while `_meta` is a declared passthrough field (`zod.gen.js:2250`).

`"asyncTasks"` is **not** advertised — that is the out-of-scope sibling, and
advertising a capability whose frames nothing consumes would put
`async_task_*` updates on the stream for no reader. The probe advertised both;
this does not.

A unit test re-implements the adapter's gate and — the part that matters —
**takes the same argument the adapter takes**, the whole `clientCapabilities`
object, doing its own `._meta` descent. The first version was handed the
already-extracted block, so it could only check shape and passed while the
feature was dead (R7). The suite includes a case that fails when the block is
correct but misplaced, plus one that models the Zod stripping.
`sessionCapabilities.subagents` in the `initialize` result is deliberately not
consulted — it is the adapter's own advertisement, not an acknowledgement of
ours, and reading it as confirmation already cost this project a wrong
conclusion once.

### `chat-delegated-work.ts` — the vendor quarantine

Grows two responsibilities, staying pure and total (ADR 0056 point 2):

1. **`delegationEvent(update)`** → `AgentDelegation | undefined`. Reads
   `subagent_spawned` (`subagentSessionId`, `name`, `task`) and
   `subagent_state_update` (`subagentSessionId`, `state`). `subagent_spawned`
   maps to `state: "started"`; `subagent_state_update`'s `state` maps through a
   closed set, and anything outside it yields `undefined` rather than a guess.
   The id is **generation-normalised** here: `a26…d:generation:2` and `a26…d`
   both yield `a26…d` (R5). Normalising at parse time is what makes "arrives
   twice" a non-issue for identity — the consumer then only needs last-write
   wins on state, with no dedupe bookkeeping of its own.
2. **Re-sourcing for the capability-on stream.** The capture shows the regime
   change RFC 0055 predicted: no opening `tool_call` for the dispatch, no
   `_meta.claudeCode.subagent` marker, and the dispatch arriving as a lone
   `tool_call_update` whose `_meta.claudeCode.toolResponse` carries
   `{ isAsync: true, status: "async_launched", agentId, description }`. So
   `delegatedWorkFacts` additionally reads:
   - `subagent: true` when `toolResponse.agentId` is a non-empty string — a
     call that names the worker it handed to **is** a dispatch;
   - `subagentId` from `toolResponse.agentId`, generation-normalised by the same
     helper;
   - `title` from `toolResponse.description` when the frame carried no `title`.

   `handedOff` and `parentToolCallId` are unchanged and keep working under both
   regimes — which is the point of ADR 0056 point 3 and is now demonstrated
   rather than argued.

`agentId` equalling the later `subagentSessionId` is the **join** the whole
feature turns on: it links a parent-side dispatch row to the child session whose
frames must render under it, and to the lifecycle events that say when it
finished.

### `acp-sessions-service.ts` — routing

Each Chat session handle owns one `AcpClient` over one child process, so routing
is a membership test, not a router:

- The handle keeps `acpSessionId` (already there, already updated when
  `session/load` adopts a new id) and a new `children: Set<string>` of
  generation-normalised child ids.
- `onUpdate(update, sessionId)` classifies the frame:
  - `sessionId === acpSessionId` or `sessionId === undefined` → **own frame**.
    Handled exactly as today, including the turn-boundary, tool-flight and
    activity signals.
  - `children.has(sessionId)` → **child frame**. Projected to the SDK update
    with `subagentId` set, journaled, and dispatched to listeners — but it does
    **not** drive turn boundaries or `toolCallsInFlight`. A subagent running
    after the parent's turn ended must not reopen that turn, and a child's
    in-flight tool call is not the parent's work (R3).
  - otherwise → **unknown**. Dropped, counted, and logged once per session id to
    the Agents channel. Attributing it to the live session is the specific
    failure this change exists to prevent, so it is a warning, not a fallback.
- A `delegationEvent` on an own frame registers its `subagentId` in `children`
  before the frame is dispatched, so the ordering the capture shows
  (`subagent_spawned` at +15.147s, the child's first `tool_call` at +16.929s)
  always finds the child registered.

`toSdkUpdate` gains the session context it needs — it is called with the frame's
classification, and sets `subagentId` only for a child frame. `delegation` is
set from the quarantine for both lifecycle kinds regardless of which session
they arrived on (the capture shows them on the **parent**).

### `agents-chat-panel` — rendering

- `applyUpdate` attributes a child frame to its subagent: a message chunk with
  `subagentId` becomes a delegated message inside the group for its dispatch
  rather than a top-level assistant message.

  **Corrected during implementation.** The design said the group is located by
  `parentToolCallId`, "which `parseToolCall` already models", falling back to
  matching `subagentId`. That is wrong for the case that matters:
  `parentToolCallId` is a field of `AgentToolCall`, so it exists only on
  tool-call frames — a child's `agent_message_chunk` carries
  `_meta.claudeCode.parentToolUseId` on the wire but has no modelled field to
  put it on, and the panel may not read `raw`. So the **`subagentId` → dispatch
  row match is the only route for prose**, and it is sufficient: the dispatch
  row already carries `subagentId`. A child's _tool calls_ still group by
  `parentToolCallId` exactly as RFC 0055 had them. Modelling a second redundant
  join on the update envelope was considered and rejected as public surface
  nothing needs.

- The transcript keeps a per-subagent state map built from `delegation` events,
  last-write-wins on the normalised id. A dispatch row renders its subagent's
  terminal state and keeps it forever — liveness is derived, a row is history
  (ADR 0056 point 4).
- `delegatedDispatchNotice` becomes a countdown: dispatches in the current
  exchange minus those whose subagent reported a terminal state, returning
  `undefined` at zero. Its long doc comment — which currently explains at length
  why a countdown is impossible — is rewritten to say what is now true, and to
  keep the one caveat that still applies: an agent that does not speak the
  capability reports no finishes, so the notice falls back to counting
  dispatches.

## Data flow

The important path, as the capture records it:

1. `tool_call_update` on **P** carrying `toolResponse { isAsync, status:
"async_launched", agentId: C, description }` → quarantine yields
   `{ subagent: true, handedOff: true, subagentId: C, title: description }` → a
   dispatch row appears, marked handed off.
2. `subagent_spawned { subagentSessionId: C, name, task }` on **P** →
   `delegation { subagentId: C, name, task, state: "started" }`; the service
   registers `C` as a child of this session.
3. `tool_call` / `tool_call_update` / `agent_message_chunk` on **C** → routed to
   P's transcript with `subagentId: C`, rendered inside C's dispatch group.
4. `subagent_state_update { subagentSessionId: C, state: "completed" }` on **P**
   — observed 25s after the parent's turn ended → `delegation { state:
"completed" }` → the dispatch row says finished and the notice counts down.
5. The same two lifecycle messages arrive again with `C:generation:2`;
   normalisation collapses them onto `C` and nothing double-counts.

## APIs / interfaces

New on the public surface (`silo-docs-sync` applies in full — TSDoc,
`@public` + `@category`, barrel re-export, the hand-authored `ctx` pages where
relevant, `pnpm docs:api`, roadmap flip):

- `AgentSessionUpdate.subagentId?: string` — "the delegated worker whose work
  this frame reports; absent for the session's own frames."
- `AgentSessionUpdate.delegation?: AgentDelegation` — the modelled subagent
  lifecycle.
- `AgentDelegation` — `{ subagentId: string; name?: string; task?: string;
state: AgentDelegationState }`.
- `AgentDelegationState` — `"started" | "completed" | "failed" | "cancelled" |
"disconnected"`.
- `AgentToolCall.subagentId?: string` — "the delegated worker this call
  dispatched."

Both `subagentId` fields carry the same noun with deliberately different
subjects — the frame's author on the update, the call's delegate on the tool
call. The TSDoc on each says which, because that distinction is the join.

Host-internal, not public: `AcpClientCallbacks.onUpdate`'s second parameter.

**Why fields and not a new `kind`.** `AgentSessionUpdate.kind` stays the wire
discriminator, so it will literally read `"subagent_spawned"` for those frames.
Consumers are never asked to match on it — they read `delegation`, the same way
they read `toolCall`, `plan` and `usage` today. That keeps the vendor spelling
out of every consumer's control flow and makes canonical `subagent_update` a
change inside the quarantine (ADR 0056 point 3).

## Persistence

The journal (RFC 0042) stores one `AgentSessionUpdate` per line, so
`subagentId` and `delegation` ride to disk with no journal change at all — and a
replay reconstructs the nesting because the attribution is in the data, not in
the arrival order. One file per **parent** session, as today; a child never gets
its own file (R9). Journals written before this change simply have no
`subagentId`, which reads as "the parent's own frame" and renders as it does now.

## Error handling

Every failure degrades to the pre-change rendering, which is the ADR 0056
discipline applied to a second vendor surface:

| Failure                                   | Behaviour                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Opt-in silently rejected                  | No child frames, no `delegation`; notice counts dispatches as today                                                       |
| Adapter stops emitting the AIR kinds      | `delegation` absent; dispatch rows keep `handedOff`                                                                       |
| `toolResponse` shape moves                | `subagent`/title re-sourcing yields absence; row renders without them                                                     |
| Unknown `state` value                     | No `delegation` for that frame; prior state retained                                                                      |
| Frame on an unknown session id            | Dropped + warned; never attributed to the live session                                                                    |
| Child frame before its `subagent_spawned` | Treated as unknown and dropped — the capture shows spawn first; inventing a parent would be the guess this change removes |

## Testing strategy

Co-located Vitest, pure-logic style (`silo-testing`). The capture is the fixture
source — frames are copied from it rather than invented, so a test asserting
"the wire looks like this" is checkable against a real capture.

- `acp-transport.test.ts` — per-session grouping: interleaved two-session
  chunks, run breaks scoped per session, id uniqueness, the no-session-id
  fallback, agent-supplied `messageId` untouched.
- `acp-jsonrpc.test.ts` — `sessionId` delivered, missing/non-string tolerated,
  and the AIR block asserted against the adapter's gate.
- `chat-delegated-work.test.ts` — `delegationEvent` over both lifecycle kinds,
  generation normalisation, the closed `state` set, unknown-state absence; and
  the re-sourced `subagent`/`subagentId`/`title` from a real
  `toolResponse`, including every degradation shape.
- `acp-update-model.test.ts` — `subagentId` on a child frame, absent on a
  parent's, `delegation` projection, `AgentToolCall.subagentId`.
- `acp-sessions-service.test.ts` — classification: own / child / unknown; a child
  frame not driving turn boundaries or tool flight; spawn-then-child ordering;
  unknown-id warning.
- `transcript-model.test.ts` — the countdown (counts down, hits zero,
  per-exchange reset, no `activity` dependency), terminal state permanence
  across replay, child prose attributed into its group, and the
  capability-off path rendering unchanged.
- `chat-session-journal.test.ts` — a child frame journaled into the parent's
  file and replayed with its attribution; a pre-change journal still replays.

## Constraints and existing decisions

- **ADR 0056** (vendor `_meta` through one quarantine) — the governing decision.
  This change extends it from a vendor `_meta` fact to a vendor **protocol
  extension Silo actively advertises**, which is a genuinely new commitment:
  Silo now asks an adapter to change what it sends. That extension is recorded
  as a new ADR in this change rather than left implicit here, because the
  collapsed proposal will not read as standing guidance (the same reasoning that
  produced ADR 0056 out of RFC 0055).
- **ADR 0050** (replay is tagged, not filtered) — the shape this follows: the
  transport reports the session id as a fact; deciding what a child means is the
  consumer's job, one layer up.
- **RFC 0038 phase 3.8** — everything a Chat UI must draw is a modelled field;
  no consumer reads `raw` for a subagent's identity or state.
- **RFC 0042** — the journal stores typed updates, one per line, one file per
  session; no compaction.
- **RFC 0055** — the delegated-work fields and the dispatch/group rendering this
  builds on. Its `handedOff` and `parentToolCallId` must keep their meanings.
- The **published-SDK lag**: third-party extensions ride the last published SDK,
  so the panel's use of the new fields lands at HEAD while third parties get
  them on the next SDK release. Nothing here depends on that ordering.
- **Not a `ctx` addition.** The capability is a property of the update stream a
  Chat UI already subscribes to, so no new `ctx` surface is needed — the
  `silo-docs-sync` workflow still applies to the new SDK types.
