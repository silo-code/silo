---
status: accepted
created: 2026-10-08
---

# 0057. Subagent sessions: routing updates by `sessionId`

## Planning scope

This package covers the **whole proposal in one pass** — routing, capability
advertisement, and rendering together. There is no phase table and no prior
phase; the three steps the original proposal sketched under "Phasing" survive
here as the **task ordering** in `tasks.md`, not as separately shipped slices.

Why one pass rather than three: step 2 on its own is the one combination the
proposal rules out. Advertising the capability without rendering child
attribution puts a subagent's forwarded prose and tool calls into the parent's
transcript unlabelled — the capture at
`scratchpad/acp-probe/captures/frames-cap-air-bg-2026-10-07T19-35-21-238Z.jsonl`
shows the child saying _"Command running in the background. I will reply
FINISHED once it completes."_ on its own session id, which would read as the
parent speaking. Routing (step 1) is inert and could ship alone, but it buys
nothing until something consumes it. So the unit of review is the whole change,
with the capability **advertised last** so every commit before it is provably
inert.

The four questions the original proposal left open are **settled here** — see
"Decisions settled in this package" below — and each is a design decision a
reviewer can push back on, not a silent reinterpretation.

## Summary

Silo's Chat client throws away the `sessionId` on every `session/update` it
receives, because until now every update belonged to the one session that was
prompted. Advertising the adapter's subagent capability breaks that assumption:
a subagent's tool calls arrive under a **child** session id, and with them the
per-subagent finish signal Silo currently cannot see. This change makes
`sessionId` a first-class part of the update path — routing, grouping,
journaling and the public update shape — then advertises the capability and
renders what it reports: per-agent completion, a status line that counts down
honestly, and the subagent's own work attributed to the agent that did it.

## Motivation

[RFC 0055](../0055-chat-async-tasks.md) made the transcript stop claiming a
dispatch had finished when it hadn't. What it could not do is say when the
delegated work **did** finish, or which agent it was, because nothing on the
capability-free stream reports either. The user-visible residue is a status line
that counts agents dispatched and never counts down, and goes stale until the
next prompt.

That limitation is **scoped, not fundamental**. The probe committed with RFC
0055 (`scratchpad/acp-probe/subagent-capability-2026-10-07.mjs`, capture
`report-cap-air-bg-2026-10-07T19-35-21-238Z.json`) established, by running it,
that advertising AIR `nativeSubagentSessions` produces:

- `subagent_spawned { subagentSessionId, name, task, capabilities }`
- `subagent_state_update { subagentSessionId, state }`, where `state` is
  `completed | failed | cancelled | disconnected` — **an identified terminal
  signal per subagent**, one observed arriving 25s after the parent's turn had
  ended
- the subagent's own tool calls on a **child session id**, and its prose
  forwarded for the first time

So the honest countdown, per-agent completion, and the subagent's own reasoning
all become renderable. The reason this is a designed change rather than a flag
flip is the third item: **the host cannot currently tell one session's updates
from another's**, and turning the capability on without fixing that would merge
every subagent's work into the parent transcript unlabelled — worse than the lie
RFC 0055 removed.

Two further motivations, both secondary but real:

- **Backgrounded shells** want the same plumbing's sibling. RFC 0055 recorded
  that AIR `asyncTasks` keeps the dispatching tool call and adds
  `async_task_state_update` with a `toolCallId` and a terminal state, needing no
  session routing at all. That is deliberately **not** in this change (see
  "Scope") — it is smaller and should not wait on this.
- **The canonical protocol is moving here.** ACP PR #1992 merged 2026-09-30,
  consolidating the draft into a single `subagent_update`. The published
  TypeScript SDK does not carry it yet, and `claude-agent-acp` still emits the
  two-message draft shape. Designing the host's seam now means the eventual
  canonical switch is a parser change, not an architecture change.

## Proposed solution

**Carry the session id from the wire to the consumer, and let the consumer
decide what a child means.** The same shape ADR 0050 settled for replay: the
transport reports a fact, it does not filter on anyone's behalf.

- `onUpdate` receives the `sessionId` alongside the update. The transport stops
  discarding it; nothing downstream has to guess.
- `makeChunkGrouper` keys its run state **per session id** rather than globally.
- The sessions service routes a child's updates to the session that owns it,
  established by `subagent_spawned`. A frame for an unknown session is dropped
  with a logged warning rather than being attributed to whichever session
  happens to be live.
- The journal keeps writing one file per **parent** session. A subagent's
  updates are journaled as part of its parent's transcript, tagged with the
  child id, so a replay reconstructs the same nesting.
- The public update gains one field naming the subagent a frame came from, and
  one modelled field projecting the two lifecycle messages — both read inside
  the existing vendor quarantine (`chat-delegated-work.ts`) per ADR 0056.
- The capability is advertised **last**, and the panel renders per-agent
  completion, an honest countdown, and the subagent's forwarded prose inside the
  delegated group.

Detail lives in `design.md`; the ordering lives in `tasks.md`.

## Decisions settled in this package

The original proposal left four questions open. Settled as follows, each
justified in `design.md` and each open to review:

1. **Public field shape — both, split by meaning.**
   `AgentSessionUpdate.subagentId` names _which delegated worker produced this
   frame_; `AgentSessionUpdate.delegation` is the modelled projection of the two
   lifecycle messages (`{ subagentId, name?, task?, state }`). Consumers never
   match on a vendor `kind` string and never read `raw`. Per ADR 0056, the
   fields name meanings, so the eventual canonical `subagent_update` is a
   quarantine-local parser change.
2. **A finished subagent's block is permanent; the notice is not.** A dispatch
   row that has seen a terminal state says so forever — a transcript row is
   history (ADR 0056 point 4). The _notice_ stays scoped to the current exchange
   and counts what is outstanding, so it disappears when every agent dispatched
   since the last user message has finished.
3. **Routing does not ship alone** — see "Planning scope". It is sequenced
   first and is inert, but the reviewable unit is the whole change.
4. **The AIR dependency is accepted.** It is additive and degrades to absence:
   with the capability off, or against an adapter that stops speaking it, every
   frame carries the one parent session id and the rendering is byte-for-byte
   today's. **One** adapter in the catalog speaks it — `claude-agent-acp`, the
   only one of the six ACP-capable agents carrying an `air-extension` module
   (checked against the pinned 0.75.1 dist during implementation; this
   proposal originally said two, which was wrong). So the feature is
   Claude-only in practice. The canonical replacement is confined to the
   quarantine. Recorded as an ADR in this change — the
   decision extends ADR 0056 from vendor `_meta` facts to a vendor **protocol
   extension** Silo actively opts into.

## Scope

In:

- `@silo-code/extension-host` — `acp-transport.ts`, `acp-jsonrpc.ts`,
  `acp-sessions-service.ts`, `chat-delegated-work.ts`, `acp-update-model.ts`.
- `@silo-code/sdk` — two new `@public` fields on `AgentSessionUpdate`, one new
  exported type, and the generated API reference / roadmap flip that go with
  them (`silo-docs-sync`).
- `@silo-code/extensions-silo` — `agents-chat-panel`: per-agent completion, the
  countdown notice, and child prose attribution.
- One ADR for the AIR advertisement decision.

Out:

- **Backgrounded shells** (AIR `asyncTasks`). The same capture carries
  `async_task_spawned` / `async_task_state_update` with a `toolCallId` and no
  session routing at all. Smaller, independent, and should ship separately.
- **The turn-end sound firing once per background notification turn.** Existing
  `endTurn` behaviour, predates this — a separate issue.
- **Cancelling or steering a subagent.** `subagent_spawned` advertises
  `capabilities: { cancel?, close? }`; acting on them is a later proposal.
- **Canonical `subagent_update`.** Merged upstream, absent from the published
  SDK and the adapter's runtime. The quarantine is where it lands when it
  arrives.

## Alternatives considered

**Do nothing; keep the capability-free design.** Defensible — RFC 0055 works and
needs no negotiation. Rejected as the end state because the status line's
imprecision is permanent under it, and that imprecision is what users notice.

**Poll instead of routing.** Rejected on evidence, not taste. There is no ACP
request that reports background state; the CLI's own `background_tasks_changed`
signal reaches the adapter but is consumed internally and never forwarded; and
subagents are explicitly excluded from the async-task lifecycle
(`task_type === "local_agent"` is marked `ignored` at both entry points). The
one remaining mechanism — polling the subagent's `outputFile` — reaches into the
agent's private temp directory and still infers completion from a file going
quiet, which is the timer we already rejected wearing a disguise.

**Wait for canonical `subagent_update`.** Deferred, not rejected: merged in the
spec but absent from the published SDK and from the adapter's runtime, with no
date. The host-side routing this change is mostly about is needed either way,
and is what makes the eventual switch cheap.

**One journal file per child session.** Rejected: multiplies files by subagent
count and orphans them when the parent is deleted, for no gain — a subagent's
transcript has no meaning apart from the turn that spawned it.

**Hand `sessionId` to the panel and let it filter.** Rejected: it is the host's
job to know which session an update belongs to, and every Chat UI including
third-party ones would otherwise reimplement the same routing.
