---
status: draft
created: 2026-10-08
---

# 0057. Subagent sessions: routing updates by `sessionId`

## Summary

Silo's Chat client throws away the `sessionId` on every `session/update` it
receives, because until now every update belonged to the one session that was
prompted. Advertising the adapter's subagent capability breaks that assumption:
a subagent's tool calls arrive under a **child** session id, and with them the
per-subagent finish signal Silo currently cannot see. This proposes making
`sessionId` a first-class part of the update path — routing, grouping,
journaling and the public update shape — and then advertising the capability so
a Chat transcript can say _this_ background agent finished.

## Motivation

[RFC 0055](./0055-chat-async-tasks.md) made the transcript stop claiming a
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
  session routing at all. That is deliberately **not** in this proposal (see
  "Out of scope") — it is smaller and should not wait on this.
- **The canonical protocol is moving here.** ACP PR #1992 merged 2026-09-30,
  consolidating the draft into a single `subagent_update`. The published
  TypeScript SDK does not carry it yet, and `claude-agent-acp` still emits the
  two-message draft shape. Designing the host's seam now means the eventual
  canonical switch is a parser change, not an architecture change.

## Design

### The shape of the problem

Three places assume one session per connection. All three are load-bearing and
all three are cheap to fix **before** any child session exists — which is the
argument for doing this as its own change rather than inside a feature.

1. **`acp-jsonrpc.ts:417-420`** reads `params.update` and never reads
   `params.sessionId`:

   ```ts
   const update = (msg.params as { update?: AcpSessionUpdate } | undefined)
     ?.update;
   if (update?.sessionUpdate) cb.onUpdate(update);
   ```

2. **`makeChunkGrouper` (`acp-transport.ts`)** holds `runKind` / `runId` as
   single globals across the whole connection. Two sessions streaming text
   concurrently — which is exactly what a forwarded subagent produces — would
   have their chunks grouped into one synthesized message.

3. **The transcript journal** (`chat-session-journal.ts`) is one file per
   `sessionId`. Child updates appended to the parent's journal would replay as
   parent content forever, and RFC 0042's "the journal stores raw frames" makes
   that permanent rather than a render-time mistake.

### Proposed change

**Carry the session id from the wire to the consumer, and let the consumer
decide what a child means.** The same shape ADR 0050 settled for replay: the
transport reports a fact, it does not filter on anyone's behalf.

- `onUpdate` receives the `sessionId` alongside the update. The transport stops
  discarding it; nothing downstream has to guess.
- `makeChunkGrouper` keys its run state **per session id** rather than globally.
- The sessions service routes a child's updates to the session that owns it,
  established by `subagent_spawned`. A child update whose parent is unknown is
  dropped with a logged warning rather than being attributed to whichever
  session happens to be live.
- The journal keeps writing one file per **parent** session. A subagent's
  updates are journaled as part of its parent's transcript, tagged with the
  child id, so a replay reconstructs the same nesting. The alternative — a
  journal file per child — multiplies files by the number of subagents and
  orphans them the moment the parent is deleted.

### Public surface

Likely one new optional field on `AgentSessionUpdate`, naming the subagent an
update belongs to, plus a modelled projection of the two lifecycle messages.
**Deliberately left open here**, because the shape should be settled against
ADR 0056's rule — a public field names a _meaning_, not a vendor spelling — and
that is easier to judge with the routing in place. Expect:

- something like `subagentId` on `AgentSessionUpdate` (absent for the parent's
  own updates)
- a modelled lifecycle update kind carrying the identified terminal state

Both ride the existing quarantine (`chat-delegated-work.ts`) per ADR 0056. No
consumer should ever see `_meta.jetbrains.air`.

### What RFC 0055's fields cost

Measured against the AIR capture, not assumed:

| RFC 0055 field        | Under this change                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `handedOff`           | unchanged — `async_launched` still arrives on the root session                                           |
| `parentToolCallId`    | unchanged, but now points **across** sessions, so resolution becomes cross-session                       |
| `subagent`            | marker stops arriving; re-source from `toolResponse.agentId` on the hand-off frame                       |
| `AgentToolCall.title` | **loses its source** — no opening `tool_call`; use `toolResponse.description` or `subagent_spawned.name` |

All four land inside the quarantine. The transcript model and the panel's
delegated-work rendering are untouched, which is the point of having named the
fields after meanings.

### The opt-in, and a trap worth not re-discovering

Advertise via AIR `_meta.jetbrains.air = { version: 1, capabilities: [...] }` on
**both** `initialize` and `session/new`.

**The canonical `clientCapabilities.subagents` opt-in does not work** on these
versions: it is stripped by the SDK's `zClientCapabilities` Zod schema before
`clientSupportsSubagents` reads it
([claude-agent-acp#1195](https://github.com/agentclientprotocol/claude-agent-acp/issues/1195)).
A silently-failed opt-in is **indistinguishable** from capability-off, and the
adapter echoing `sessionCapabilities.subagents` back in its `initialize` result
is its _own_ advertisement, not confirmation of ours. Both facts cost this
project a wrong conclusion already; any implementation must assert the opt-in
registered rather than trusting it.

Also from the capture: `subagent_spawned` and `subagent_state_update` each
arrive **twice** per `subagentSessionId` (the second carrying a
`:generation:2`-suffixed id). The consumer must dedupe; pairing edges naively
will double-count.

### Phasing

1. **Routing only, capability off.** Carry `sessionId` through transport,
   grouper, service and journal. No behaviour change — every update still has
   the one parent session id, so this is provably inert and independently
   reviewable.
2. **Advertise the capability**, model the lifecycle, re-source `subagent` and
   the dispatch title.
3. **Render**: per-agent completion, an honest countdown, and optionally the
   subagent's forwarded prose.

Phase 1 is the one with architectural risk and no user-visible payoff, which is
exactly why it should land on its own.

## Alternatives considered

**Do nothing; keep the capability-free design.** Defensible — RFC 0055 works and
needs no negotiation. Rejected as the end state because the status line's
imprecision is permanent under it, and that imprecision is what users notice.

**Poll instead of routing.** Rejected on evidence, not taste. There is no ACP
request that reports background state; the CLI's own `background_tasks_changed`
level signal reaches the adapter but is consumed internally and never forwarded;
and subagents are explicitly excluded from the async-task lifecycle
(`task_type === "local_agent"` is marked `ignored` at both entry points). The
one remaining mechanism — polling the subagent's `outputFile` — reaches into the
agent's private temp directory and still infers completion from a file going
quiet, which is the timer we already rejected wearing a disguise.

**Wait for canonical `subagent_update`.** Rejected for now: merged in the spec
but absent from the published SDK and from the adapter's runtime, with no date.
The host-side routing this proposal is mostly about is needed either way, and
is what makes the eventual switch cheap.

**One journal file per child session.** Rejected: multiplies files by subagent
count and orphans them when the parent is deleted, for no gain — a subagent's
transcript has no meaning apart from the turn that spawned it.

**Hand `sessionId` to the panel and let it filter.** Rejected: it is the host's
job to know which session an update belongs to, and every Chat UI including
third-party ones would otherwise reimplement the same routing.

## Out of scope

- **Backgrounded shells.** AIR `asyncTasks` needs no session routing and is a
  much smaller change; it should ship independently and sooner. Noted here only
  so the two are not conflated.
- **The turn-end sound firing once per background notification turn.** A real
  annoyance with many subagents, but it is `endTurn`'s existing behaviour and
  predates all of this — a separate issue.
- **Cancelling or steering a subagent.** `subagent_spawned` advertises
  `capabilities: { cancel?, close? }`; acting on them is a later proposal.

## Decision

Not yet decided. Open questions for review:

1. **The public field shape** — `subagentId` on `AgentSessionUpdate`, a modelled
   lifecycle kind, or both? Settle against ADR 0056's meaning-not-spelling rule.
2. **How long does a finished subagent's block stay in the transcript?** The
   terminal state lets a row say "finished"; whether it also collapses, and
   whether a count persists after the turn, is a product call.
3. **Does phase 1 ship alone?** It has no user-visible effect, which makes it
   both safe and hard to justify on its own. Recommendation: yes — the risk is
   concentrated there.
4. **Is the AIR dependency acceptable?** It is a vendor extension that
   `claude-agent-acp` and `codex-acp` both speak, but it is not the canonical
   protocol, and the canonical replacement has already merged upstream.
