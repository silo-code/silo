---
status: accepted
date: 2026-10-08
---

# 0057. Silo may advertise a vendor protocol extension, parsed through the same quarantine

## Context

[ADR 0056](0056-vendor-meta-through-one-quarantine.md) settled how Silo reads a
vendor fact it happens to be sent: through one quarantine module, as a field
naming a meaning rather than a spelling. Every commitment in it is **passive**
— the agent sends what it sends, and Silo tolerates it.

RFC 0057 crosses a line that decision did not consider. To report when delegated
work finished, Silo advertises AIR `nativeSubagentSessions` in
`initialize`'s `clientCapabilities._meta` — a **vendor extension to the
protocol**, not in the ACP schema and not in `@agentclientprotocol/sdk`. Silo is no longer
tolerating what an agent sends; it is **asking the agent to send something
else**, and getting a stream it would not otherwise have seen: a subagent's
tool calls and prose on a child session id, plus
`subagent_spawned` / `subagent_state_update`.

That is a genuinely different kind of commitment, and the reasons it is not
obviously right:

- **It changes the shape of the stream, not just its contents.** With the
  capability on, the dispatch's opening `tool_call` and the
  `_meta.claudeCode.subagent` marker stop arriving, and frames appear on
  session ids the host has never seen. A host that mis-handles that merges one
  conversation into another — worse than the imprecision RFC 0055 removed.
- **The canonical replacement already exists.** ACP PR #1992 merged 2026-09-30,
  consolidating this into a single `subagent_update`. It is absent from the
  published TypeScript SDK and from `claude-agent-acp`'s runtime, with no date.
  So Silo is adopting a shape that is known to be temporary.
- **The opt-in cannot be confirmed, and failure is silent.** The canonical
  `clientCapabilities.subagents` spelling is stripped by the SDK's own Zod
  schema (`zClientCapabilities` is a plain `z.object`) before the adapter reads
  it, which is why the AIR block rides in `_meta` — a declared passthrough
  field — instead. And `sessionCapabilities.subagents` in the `initialize`
  result is the _adapter's_ advertisement, never an acknowledgement of ours —
  reading it as confirmation already cost this project one wrong conclusion.
  So a failed opt-in is indistinguishable from capability-off, and this is not
  hypothetical: the first implementation sent a correctly-shaped block one
  level too high (beside `clientCapabilities` rather than inside it), shipped
  green, and did nothing at all. Every test passed because they asserted the
  block's shape rather than the object the adapter actually reads.

The alternative was not doing it. That is defensible and was considered at
length: the capability-free design works, needs no negotiation, and RFC 0055
already stopped the transcript lying. It was rejected as an end state because
under it the status line's imprecision is **permanent** — it counts agents
dispatched and can never count down — and that imprecision is the thing users
notice.

## Decision

**Silo may actively advertise a vendor protocol extension, under four
conditions.** The extension's own update kinds are read through the same
quarantine ADR 0056 established, so nothing about the public surface changes.

1. **The capability must be additive and degrade to absence.** With it
   unadvertised, or against an agent that stops honouring it, every frame
   carries the one parent session id, no `delegation` is projected, and the
   rendering is byte-for-byte the prior release's. The degradation path is the
   error path, exactly as in ADR 0056 point 2 — extended here from a field's
   supply to a whole negotiated regime.
2. **The advertisement is asserted end-to-end, not trusted.** The block Silo
   sends is one named constant, and a unit test re-implements the adapter's own
   gate — **taking the same argument the adapter takes**, so it fails on
   placement and not only on shape. That distinction is the whole lesson of the
   first implementation: a gate handed the already-extracted `_meta` can only
   check the block, and the block was never the thing that was wrong. A runtime
   signal — one log line when the first child frame routes — is the
   complementary check, because no unit test can prove the live adapter
   accepted it.
3. **Advertise only what something consumes, and only where it is read.**
   `"asyncTasks"` is deliberately not advertised: it is a separate feature
   (backgrounded shells), and advertising it would put `async_task_*` frames on
   the stream for no reader. A capability is a request for data, and unread
   data is a liability — it is journaled, replayed, and fanned out to every
   extension listener. The same discipline applies to placement: the block goes
   on `initialize` only, because that is the only message the adapter gates
   subagents on. A copy on `session/new` looked like belt-and-braces and was
   simply noise nothing reads.
4. **The vendor kinds stay in the quarantine, and the public fields name
   meanings.** `delegationEvent` in `chat-delegated-work.ts` is the only reader
   of `subagent_spawned` / `subagent_state_update`. `AgentSessionUpdate.kind`
   still carries the wire's own discriminator and will literally read
   `"subagent_spawned"` — but no consumer matches on it. They read
   `delegation`, so the canonical `subagent_update` lands as a parser change
   inside one module.

**And one host rule the capability forces, which is not about vendors at all:**
the host decides which session an update belongs to. The transport reports the
`sessionId` as a fact (the shape ADR 0050 settled for replay); the sessions
service maps child to parent and **drops a frame it cannot place**, with a
warning. Attributing an unplaceable frame to whichever session is live is the
specific failure this whole change exists to prevent, so it is never a
fallback.

## Consequences

- Per-agent completion, an honest countdown, and a subagent's own reasoning all
  become renderable — none of which the capability-free stream can supply. The
  "a per-subagent finish signal cannot be derived" claim ADR 0056 flagged as
  wrongly unscoped is now not just scoped but superseded.
- A third-party Chat UI gets all of it from the same modelled fields the
  first-party panel reads, which is the RFC 0038 promise held for a case the
  protocol does not cover.
- Silo's correctness now depends on a negotiated regime, not only on fields it
  passively receives. Condition 1 is what makes that survivable and condition 2
  is what makes a failure visible; neither removes the dependency.
- **Routing is the durable part.** The canonical `subagent_update` will replace
  the AIR kinds, but a child session will still be a child session — so the
  parent↔child map, the drop-on-unknown rule, and the per-session chunk
  grouping outlive the vendor extension that motivated them. That asymmetry is
  the reason this was worth designing rather than flag-flipping.
- **One adapter in the catalog speaks AIR: `claude-agent-acp`.** Of the six
  ACP-capable agents (cursor, opencode, copilot, claude, codex, pi), it is the
  only one carrying an `air-extension` module — checked against the pinned
  0.75.1 dist, 2026-10-08. So this feature is Claude-only in practice, and an
  agent that speaks neither AIR nor the canonical replacement simply never
  reports delegation: its users see exactly what they saw before this change.
  (RFC 0057 claimed two adapters; that was carried into an earlier draft of
  this ADR unverified, and is wrong.)
- **The canonical spelling cannot reach an agent yet, which is why this is not
  self-spreading.** ACP PR #1992 puts the opt-in at
  `clientCapabilities.subagents`, but the published SDK's `zClientCapabilities`
  is a plain `z.object` that strips unknown keys — so even an agent that
  implemented the canonical spec would not see Silo's opt-in until it ships an
  SDK whose schema names that field. Advertising the canonical spelling
  alongside AIR was considered and deferred: it is untestable today, and
  condition 3 above is explicit that a capability goes only where something
  reads it.
- Nothing mechanical enforces conditions 1, 3 or 4 — same limitation ADR 0056
  records. Condition 2 is the one that _is_ enforced, by test.
- **A test of a wire format must assert what the reader reads.** The lesson
  generalises past this capability: when the contract is "the peer finds X at
  path P", a test that builds X and checks it is X proves nothing about P. Mirror
  the peer's entry point, pass it what the peer is passed, and include a case
  that fails when the payload is correct but misplaced.

Recorded from RFC 0057; see that proposal for the committed captures, the
observed frame ordering, and why routing could not ship on its own.
