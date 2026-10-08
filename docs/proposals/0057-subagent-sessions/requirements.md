# Requirements — 0057. Subagent sessions

The behavioral specification for the whole change: routing, capability, and
rendering. Working artifact — removed when the proposal collapses.

Evidence for every wire shape asserted below is the committed capture
`scratchpad/acp-probe/captures/frames-cap-air-bg-2026-10-07T19-35-21-238Z.jsonl`
(AIR `nativeSubagentSessions`, backgrounded subagent). Where a requirement says
"the capture shows", it is checkable against that file.

## R1 — The session id survives the transport

Every `session/update` notification reaches the host's update consumer with the
`sessionId` the wire carried, not just the inner `update` object.

### Acceptance criteria

- [ ] `AcpClientCallbacks.onUpdate` receives the frame's `sessionId` alongside
      the update.
- [ ] A notification whose `params.sessionId` is missing or not a string is
      delivered with no session id rather than dropped — an older agent that
      omits it keeps working.
- [ ] A notification with no usable `update.sessionUpdate` is still ignored, as
      today.
- [ ] No consumer reads `sessionId` out of `AgentSessionUpdate.raw`.

## R2 — Chunk grouping is per session

Synthesized `messageId` runs are tracked per session id, so two sessions
streaming text concurrently never have their chunks folded into one message.

### Acceptance criteria

- [ ] Interleaved `agent_message_chunk` frames on two session ids receive two
      distinct synthesized `messageId`s.
- [ ] Consecutive same-kind chunks on one session id still share one
      `messageId`, exactly as today.
- [ ] A run-breaking kind on one session does not reset the other session's run.
- [ ] A frame that already carries its own `messageId` is still left untouched.
- [ ] Synthesized ids remain unique across sessions (no two sessions mint the
      same id).

## R3 — The host routes a child's updates to the session that owns it

A frame arriving on a child session id is attributed to the parent session that
spawned that child, established by `subagent_spawned`.

### Acceptance criteria

- [ ] A frame whose session id matches the connection's own session is handled
      as today.
- [ ] After `subagent_spawned { subagentSessionId: C }` arrives on parent `P`,
      a frame on `C` is delivered to `P`'s update listeners, journal and
      transcript.
- [ ] A frame on an unrecognised session id is dropped, counted once, and logged
      as a warning to the Agents output channel — never attributed to the live
      session.
- [ ] A session id adopted by `session/load` is recognised as the connection's
      own id (the existing adoption path keeps working).
- [ ] Turn-boundary, tool-call-flight and activity signals continue to be driven
      by the **parent's** own frames; a child's frames do not start or end the
      parent's turn.

## R4 — A subagent's identity reaches the public update

A consumer can tell which delegated worker a frame came from, and can read the
subagent lifecycle, without touching `raw` or any vendor spelling.

### Acceptance criteria

- [ ] `AgentSessionUpdate.subagentId` is set on every frame that arrived on a
      child session id, and absent on the parent's own frames.
- [ ] `AgentSessionUpdate.delegation` is set for `subagent_spawned` and
      `subagent_state_update`, carrying the subagent id, its `name`/`task` where
      the wire supplied them, and a `state`.
- [ ] `state` is one of `started | completed | failed | cancelled | disconnected`
      — an unrecognised wire state yields no `delegation` at all rather than a
      guess.
- [ ] `AgentToolCall.subagentId` is set on a dispatch frame from the vendor's
      `toolResponse.agentId`, giving the id that joins a dispatch row to its
      child session (the capture shows `agentId` equal to the later
      `subagentSessionId`).
- [ ] Both fields are `@public`, TSDoc'd, re-exported from the SDK barrel, and
      present in the generated API reference; the roadmap entry flips per
      `silo-docs-sync`.

## R5 — The lifecycle messages are deduped by identity

The capture shows `subagent_spawned` and `subagent_state_update` arriving
**twice** per subagent, the second pair carrying a `:generation:2`-suffixed id.
A consumer pairing edges naively would double-count.

### Acceptance criteria

- [ ] `delegation.subagentId` is the generation-stripped id, so both arrivals
      identify the same subagent.
- [ ] The un-normalised wire id remains available in `raw`.
- [ ] Two dispatches in one exchange count as two subagents; one subagent
      reported twice counts as one.
- [ ] A second terminal state for an already-finished subagent does not change
      the count or the row.

## R6 — The vendor shapes are read in one module

Everything vendor-specific this change reads — the AIR update kinds and the
`_meta.claudeCode` re-sourcing — is read inside `chat-delegated-work.ts`.

### Acceptance criteria

- [ ] No new reader of `_meta` or of an AIR update kind exists outside
      `chat-delegated-work.ts`; `grep` for `jetbrains` and `claudeCode` in
      `packages/` finds only that module (and the probe scratchpad).
- [ ] The module stays pure and total: wire in, meaning out, no state, and an
      unrecognised shape yields absence rather than a throw or a half-applied
      marking.
- [ ] `AgentToolCall.subagent` and the dispatch title are re-sourced for the
      capability-on stream, where the capture shows no opening `tool_call` and
      no `_meta.claudeCode.subagent` marker: `subagent` from the presence of
      `toolResponse.agentId`, the title from `toolResponse.description`, with
      `subagent_spawned.name` as the fallback.
- [ ] `handedOff` and `parentToolCallId` keep their meanings and their current
      rendering under both regimes.

## R7 — The capability opt-in is asserted, not trusted

The canonical `clientCapabilities.subagents` opt-in is stripped by the SDK's Zod
schema before the adapter reads it, and a silently-failed opt-in is
indistinguishable from capability-off.

### Acceptance criteria

- [ ] The AIR block is advertised **inside `initialize`'s
      `clientCapabilities`** — the only place the adapter reads it from
      (`clientSupportsSubagents(this.clientCapabilities)`). Not beside it, and
      not on `session/new`, whose `_meta` is never consulted for AIR.
      _(Amended during implementation: the original criterion said "both
      `initialize` and `session/new`" and said nothing about nesting, which is
      exactly the bug that shipped.)_
- [ ] The advertised object satisfies the adapter's own gate — integer
      `version >= 1` and an array `capabilities` containing
      `"nativeSubagentSessions"` — asserted by a unit test that takes **the
      same argument the adapter takes** (the whole `clientCapabilities`), so it
      fails on misplacement as well as on shape.
- [ ] The block survives `zClientCapabilities`, which strips unknown keys but
      passes `_meta` through.
- [ ] `sessionCapabilities.subagents` echoed in the `initialize` result is
      **not** treated as confirmation of our opt-in anywhere in the code or the
      logs.
- [ ] The first frame routed to a child session logs once to the Agents channel,
      giving a runtime signal that routing engaged.

## R8 — Delegated work renders with honest, per-agent state

### Acceptance criteria

- [ ] A dispatch row whose subagent has reported a terminal state says so, and
      distinguishes `completed` from `failed`/`cancelled`/`disconnected`.
- [ ] The row's terminal state is permanent — it does not revert when the
      session goes idle, when the turn ends, or across a journal replay.
- [ ] The exchange notice counts what is outstanding (dispatched minus
      finished), and disappears when every agent dispatched since the last user
      message has finished.
- [ ] The notice still does not depend on `AgentInfo.activity`, so it does not
      blink while subagents work between turns.
- [ ] A child's forwarded `agent_message_chunk` renders attributed to the
      subagent inside its delegated group, never as the parent's own prose.
- [ ] A child's tool calls render inside the delegated group for their dispatch,
      as RFC 0055's `parentToolCallId` grouping already does.
- [ ] With the capability off or unsupported, the transcript renders exactly as
      it does today.

## R9 — A replayed transcript reconstructs the same nesting

### Acceptance criteria

- [ ] Child frames are journaled into the **parent's** journal file, with
      `subagentId` on the stored update; no journal file is created per child.
- [ ] A `journal-only` restore and a `session/resume` reconnect both re-render
      delegated groups, child attribution, and terminal states from the journal
      alone.
- [ ] A journal written before this change (no `subagentId`) still replays.
- [ ] Deleting a parent session's journal takes its subagents' records with it.

## Out of scope

- Backgrounded shells (AIR `asyncTasks` — `async_task_spawned` /
  `async_task_state_update`), which need no session routing.
- Cancelling, closing or steering a subagent via
  `subagent_spawned.capabilities`.
- Canonical `subagent_update` parsing.
- The turn-end sound firing per background notification turn.
