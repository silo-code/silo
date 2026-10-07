---
status: accepted
date: 2026-10-07
---

# 0056. A vendor `_meta` fact reaches the SDK through one quarantine module

## Context

ACP's `session/update` carries a `_meta` object the protocol places no schema
on. Agents use it heavily: `claude-agent-acp` alone puts `toolName`,
`subagent`, `parentToolUseId`, `toolResponse`, `skill`, and a per-turn
`_claude/origin` in there, and none of those appear in the ACP schema or in
`@agentclientprotocol/sdk`'s types.

RFC 0038 phase 3.8 settled the rule for everything the protocol _does_ define:
**everything a Chat UI must draw is a modelled field**, read once in
`acp-update-model.ts`, so no consumer reaches into `AgentSessionUpdate.raw`.
`raw` stays as the escape hatch for what that file deliberately leaves alone —
and `_meta` was on that list.

RFC 0055 broke the tie. A Claude subagent dispatch settles its tool call to
`"completed"` about 0.4s after handing the work off, while the delegated work
runs for minutes. The transcript therefore said finished when it wasn't, and
the only evidence otherwise — `subagent`, `async_launched`, `parentToolUseId` —
lives in `_meta`. Three options, and none of them is obviously right:

1. **Leave it.** The row keeps lying. Rejected: it is the single most wrong
   thing the Chat panel says.
2. **Expose `_meta` on `AgentToolCall`.** Every consumer becomes a vendor
   parser, and RFC 0038's rule is dead — the panel would be reading `raw` by
   another name.
3. **Model it**, and read the vendor shape in exactly one place.

Option 3 is what shipped, and it is not a local call. It publishes a `@public`
SDK field whose source is an undocumented, unversioned CLI's internal JSON. A
published field cannot be withdrawn, so getting the rule wrong means a breaking
SDK change later — the repo's own test for when a decision earns a record.

The branch also demonstrated why the rule needs to be general rather than
inferred from one example. `acp-update-model.ts` now documents "never `_meta`,
except this once," which is a shape that invites a second exception, and RFC
0055 collapses into a feature record that will not read as standing guidance.

## Decision

**A vendor `_meta` fact may become a modelled SDK field, through exactly one
module that owns reading it — and the field must state a meaning, not a
spelling.**

1. **One quarantine module per feature.** `chat-delegated-work.ts` is the only
   place `_meta.claudeCode` is read for delegated work. `parseToolCall` calls
   it and spreads the result; nothing downstream — host or extension — sees
   `_meta`. A second reader is the violation, not the first.
2. **The module is pure and total.** Wire in, meaning out, no state. Every read
   is guarded, and an unrecognised shape yields _absence_, never a throw and
   never a half-applied marking. Because the source is versioned by nothing,
   the degradation path **is** the error path: when the vendor moves, the
   feature silently reverts to the previous rendering.
3. **The public field names the meaning.** `handedOff` means "this status
   describes the hand-off, not the work" — not "`toolResponse.status` was
   `async_launched`". This is what makes the field survive its own source
   changing, and it is not theoretical: advertising AIR `nativeSubagentSessions`
   stops `_meta.claudeCode.subagent` arriving, while `handedOff` and
   `parentToolCallId` keep their meanings and are re-sourced inside the
   quarantine (probed 2026-10-07; captures in `scratchpad/acp-probe/`).
4. **Each field is a durable fact about one frame**, settled at parse time and
   never revised. Derived state that changes over time — liveness above all —
   is not a field. A consumer that wants it computes it, so the SDK never has
   to promise an update it cannot deliver.
5. **The bar is the same one `ctx` answers to.** A vendor fact earns a modelled
   field when a Chat UI cannot draw a correct transcript without it. "It is
   available in `_meta`" is not a reason.

## Consequences

- A third-party Chat UI can render delegated work without knowing the Agent
  Client Protocol's wire shapes, which is the RFC 0038 promise held intact for
  a case the protocol does not cover.
- The vendor-coupling surface is one file per feature and auditable by grep.
  `claudeCode` appears in `chat-delegated-work.ts` and nowhere else in the
  panel or the SDK.
- Point 3 is the load-bearing one, and it has already paid: a regime change
  that removes one field's source leaves the other two untouched and confines
  the repair to the quarantine. A field named after the vendor's spelling would
  have broken the public surface instead.
- The honest cost: Silo now ships `@public` fields whose supply depends on an
  agent that owes us nothing. That is accepted deliberately — the alternative
  was a transcript that lies — and point 2 is what makes it survivable.
- A claim about what the wire can and cannot do must be **scoped to the stream
  it was observed on**. The same branch shipped "a per-subagent finish signal
  cannot be derived" into the public docs, which was true of the
  capability-free stream and false in general; the capability supplies exactly
  that signal. Unscoped impossibility claims in TSDoc age badly and are read as
  contracts.
- Nothing mechanical enforces this. Lint cannot express "only this module reads
  `_meta`", so it is a review rule — which is why it is written down here
  rather than left implicit in one file's comment.

Recorded from RFC 0055; see that proposal for the frames, the capability probe,
and the field-by-field cost of the next regime.
