# Requirements — 0062. Agent questions (ACP elicitation)

**Phase 4 only: host plumbing + the public SDK surface.** Phase 3 (the schema
parser) has shipped; phase 5 (the form card and the capability flip) is out of
scope — see `proposal.md`'s Sequencing table.

The deliverable is an inbound `elicitation/create` that reaches an extension as
a parsed, answerable request, and reaches the user as the existing `blocked`
chrome. Still **inert**: no agent sends an elicitation until phase 5 advertises
`clientCapabilities.elicitation.form`, so everything here is reachable but
unreached.

## R1 — `elicitation/create` is answered, never dropped

The protocol layer gains its second named inbound request. Every path answers
exactly once; no path leaves the agent waiting.

### Acceptance criteria

- [ ] `elicitation/create` is parsed into an `AcpElicitationRequest` carrying
      the phase-3 `parseElicitation` result, and handed to the host callback.
- [ ] The JSON-RPC **result is the response object itself** —
      `{ action, content? }` — not nested under a wrapper key the way
      `session/request_permission` nests `outcome`.
- [ ] The responder is one-shot: the first answer wins and later calls are
      ignored, matching the permission responder.
- [ ] No registered host callback → `cancel`, not `-32601`. The method is
      handled; there is simply no one to show it to.
- [ ] A `mode: "url"` request is answered `cancel` and logged. Silo advertises
      `form` only, so this is an agent exceeding what we declared — url mode is
      the MCP OAuth handoff and is deferred entirely.
- [ ] `elicitation/create` no longer falls through to the unknown-method
      `-32601` branch.

## R2 — A question blocks the turn exactly the way a permission request does

The elicitation path drives the **same** `raiseBlockedOnUser` /
`clearBlockedOnUser` helpers phase 2 extracted. No new activity value, no
second copy of the six rules.

### Acceptance criteria

- [ ] A disposed session, or one with no extension listener, answers `cancel`
      immediately.
- [ ] `activity: "blocked"` is set unconditionally while the question is open.
- [ ] `needsAttention` is set **only** when this is not the active session.
- [ ] A listener that answers **synchronously** raises no attention and no
      sound at all — it was never a turn blocked on a human.
- [ ] Answering clears attention, sets `"working"`, and adopts the turn via
      `noteAgentActivity()`, so an elicitation arriving outside any `prompt()`
      does not leave the session reading "working" until its process dies.
- [ ] A listener that throws does not prevent the remaining listeners from
      seeing the request, and does not leave it unanswered.

## R3 — The public surface offers parsed questions, not raw JSON Schema

`AgentSessionHandle` gains `onElicitation`, mirroring the `onPermission` pair:
parsed fields for consumers plus `raw` for anything the model does not name.

### Acceptance criteria

- [ ] `onElicitation(listener)` returns a `Disposable`; disposing the session
      clears its listeners.
- [ ] The delivered request carries `message`, `questions`, `acknowledgeOnly`,
      optional `toolCallId`, and `raw`.
- [ ] `respond(answers)` / `decline()` / `cancel()` are each idempotent and
      mutually exclusive — first call wins.
- [ ] `respond` serializes through the phase-3 `toElicitationContent`, so an
      extension never reimplements the schema subset or the coercion rules.
- [ ] Every new symbol is `@public` + `@beta` with a `@category`, re-exported
      from the SDK barrel, and present in the generated API reference.

## R4 — The answer shape can express every control the parser produces

### Acceptance criteria

- [ ] An answer is `{ value?, custom? }` per question, where `value` may be a
      string, a string array, a boolean or a number.
- [ ] A question answered with `custom` text writes the companion's field key,
      inherited from `toElicitationContent` rather than re-derived.
- [ ] `decline` and `cancel` carry no content: `decline` is _the user's_ skip
      (the agent continues with empty answers), `cancel` aborts the tool call.
      The distinction is documented on the public surface, since both adapters
      act on it differently.

## Out of scope

- Advertising `clientCapabilities.elicitation.form` (phase 5 — it is the switch).
- The form card UI and its Chat transcript placement (phase 5).
- Auto Accept interaction: RFC 0047 is permission-only **by decision**, and
  nothing here extends it to questions.
- `url`-mode elicitation and `elicitation/complete` (deferred entirely).
- Option `preview` rendering — still reachable only through `raw`.

## Deliberate divergence from `proposal.md`

The proposal sketched `respond(answers: Record<string, string | readonly
string[]>)`. That shape **cannot express** a boolean or number answer, or a
custom-answer override — all three of which the phase-3 parser produces and the
protocol requires coercion for. R4's `{ value?, custom? }` replaces it. The
proposal is updated to match rather than left to contradict the code.
