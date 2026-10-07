# Requirements — 0055. Delegated work in a Chat session

The behavioral specification for the proposal's single implicit phase (see
`proposal.md` → "Planning scope"). Working artifact — removed when the proposal
collapses.

Every requirement below is satisfiable from frames Silo already receives, with
no capability negotiation. "The capture" means the committed probe capture
`scratchpad/acp-probe/captures/frames-2026-10-06T20-05-31-821Z.jsonl`.

## R1 — A handed-off dispatch never reads as settled

A tool call that reported a terminal status while only handing its work off to
run elsewhere must not render as a finished call. The row says the work was
handed off; it never claims the work completed.

### Acceptance criteria

- [ ] A call whose vendor payload reported `isAsync` / `status:
  "async_launched"` is marked as handed off, and stays marked after the
      later frame that sets `status: "completed"` arrives.
- [ ] The row for such a call renders a handed-off treatment, not the
      `completed` treatment an ordinary finished call gets.
- [ ] The row never displays a completion, duration, or success affordance for
      the delegated work.
- [ ] An ordinary (non-handed-off) call's rendering is byte-for-byte unchanged.

## R2 — A dispatch is identified as a subagent dispatch

A call the agent used to start a subagent is recognisable as one, titled with
the subagent's own description rather than the generic tool name.

### Acceptance criteria

- [ ] A call carrying the vendor's explicit subagent marker is flagged as a
      subagent dispatch, with no inference from the tool name.
- [ ] The flag survives later frames on the same call id that omit the marker
      (the capture carries it on the opening frames only).
- [ ] The row renders as `Agent(<title>)`, using the streamed description
      (`"Sleep then reply"` in the capture), not the opening `"Task"`.
- [ ] A dispatch whose description never arrives still renders, falling back to
      the title the wire did give.

## R3 — Delegated tool calls are attributed to their dispatch

Every tool call a subagent makes is attributed to the dispatch it was made on
behalf of, and the transcript shows that attribution as the calls arrive.

### Acceptance criteria

- [ ] A call carrying the vendor's parent-call pointer exposes the dispatching
      call's id as a modelled field.
- [ ] A delegated call is visually distinguishable from a call the parent agent
      made itself, and identifies its dispatch.
- [ ] Attribution holds when delegated calls arrive in a later,
      agent-initiated turn than the dispatch (observed regime — see the
      proposal's "Both turn regimes occur").
- [ ] A delegated call is never folded into a generic collapsed tool run, and
      never causes a non-delegated run to fold differently than it does today.

## R4 — Outstanding delegated work is visible in aggregate

While delegated work is outstanding, the panel says how much, without
attributing any individual finish it cannot prove.

### Acceptance criteria

- [ ] With one or more outstanding dispatches and the session working, the
      panel shows a single aggregate line naming the count.
- [ ] The count is of dispatches, is pluralised correctly, and is absent at
      zero.
- [ ] No row and no count claims that a _named_ delegated agent finished.
- [ ] The line clears per the liveness rule in `design.md` and does not persist
      indefinitely after the session goes idle.

## R5 — An unrecognised vendor shape degrades to today's behaviour

The vendor fields this reads are undocumented and versioned by nothing. A shape
the parser does not recognise must produce today's rendering, not an error and
not a half-applied marking.

### Acceptance criteria

- [ ] A tool-call frame with no `_meta`, a non-object `_meta`, a non-object
      `_meta.claudeCode`, or a `toolResponse` of an unexpected shape yields all
      three new fields absent.
- [ ] With all three absent, the transcript renders exactly as it does before
      this change.
- [ ] The parser throws on no input it is given, including a `toolResponse`
      that is a string, an array, or `null`.
- [ ] No consumer outside the parser module reads `_meta`.

## R6 — The new public surface ships documented

Three fields land on a `@public` SDK type, so the change carries the full
documentation workflow in the same commit.

### Acceptance criteria

- [ ] Each field has TSDoc stating what it means and that it is a durable fact
      about one frame, never revised.
- [ ] The generated API reference is regenerated (`pnpm docs:api`) and committed.
- [ ] The hand-authored Chat-sessions page describes the delegated-work fields.
- [ ] The roadmap's Chat-sessions row names the new modelled fields.
- [ ] `docs/domain-language.md` carries whatever term this change introduces, or
      the decision that it introduces none is explicit.

## Out of scope

- **Backgrounded shells.** Blocked on AIR `asyncTasks`, which cannot be
  advertised without deleting the row this phase fixes.
- **Per-dispatch completion.** Nothing on the wire says which dispatch
  finished; resolving by order would misattribute a finish by name.
- **Nested session routing.** `sessionId`-aware update routing is a
  prerequisite RFC, not part of this phase.
- **Tab indicator, sound, attention.** `AgentInfo` carries no collections, so a
  session-scoped delegated-work signal does not exist; inventing one is out of
  scope (ADR 0030).
- **`agentId` and `outputFile`.** Present on the wire, deliberately not
  exposed — a path into the agent's private temp directory is a capability
  decision.
- **A duration for delegated work.** The wire carries none anywhere; the CLI's
  `finished · 46s` is the CLI timing itself.
