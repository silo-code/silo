---
status: accepted
created: 2026-10-14
---

# 0062. Agent questions (ACP elicitation)

> **This package covers phase 4 only** — host plumbing + the public SDK
> surface. Phases 1–3 have shipped; `requirements.md`, `design.md` and
> `tasks.md` are scoped to phase 4 and say nothing about phase 5. See
> Sequencing for the full table.

## Summary

Let a Chat agent ask a **real structured question** instead of a row of
permission buttons. Silo advertises `ClientCapabilities.elicitation.form`,
handles the inbound `elicitation/create` request, renders it as a form card in
the Chat transcript, and exposes it on the public surface as
`AgentSessionHandle.onElicitation`. The agent's `AgentActivity` while the form is
open is the existing `"blocked"` — **widened** from "stalled on a permission
request" to "stalled awaiting a user answer", rather than given a new enum value.

The capability must be **enabled** alongside the renderer, not before it: for
Claude, declaring it _moves_ `AskUserQuestion` off the permission path, so
advertising it without a renderer turns working questions into `-32601` errors.
That is a constraint on the final flip, not on the whole change — see
Sequencing, where four of the five phases land inert.

### Relationship to the "needs input" status

Three things get conflated under "showing that an agent needs input". They are
separable, and only one of them is this RFC's work:

| Piece                                                                                                                                 | State                                                                    | 0062's involvement                                        |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| **The status itself** — `activity: "blocked"`, the amber pulsing row, the chime on `startedBlocking`, `needsAttention` when unfocused | **shipped** (Chat only)                                                  | reuses it; **one string change**                          |
| **The form in the transcript** — rendering the question and collecting the answer                                                     | does not exist                                                           | all of it                                                 |
| **Terminal-kind `blocked`** — the same signal for a raw-PTY agent                                                                     | [RFC 0044](./0044-terminal-agent-permission-block-detection.md), `draft` | none — a PTY agent speaks no ACP, so never an elicitation |

So the status layer needs no design work: `deriveStatusRow` already maps
`blocked → warn`, `startedBlocking` already gates the chime so a resume landing
mid-request doesn't ring, and `agents-panel-view.ts:72` already rolls `blocked`
up as busy. A question inherits all of it for free. **This is the argument for
widening `blocked` rather than adding an enum value** — the presentation pattern
is built, correct, and reason-agnostic.

With one exception, which is a real defect this RFC must fix rather than
inherit: `deriveTab` (`agent-view.ts:99`) hardcodes the tooltip
**`"Waiting for permission"`**. The moment a question can block a turn, that
string is wrong. It becomes `"Waiting for you"` — accurate for both, no new
field, and the user learns which it is the instant they open the tab. See
Alternatives for the `blockedReason` option considered instead.

**Not blocked on [RFC 0038](./0038-acp-agent-sessions.md).** Everything 0062
leans on there has shipped (phase 2's permission plumbing, phase 3's inline
permission card, `blocked` itself at `acp-sessions-service.ts:1015`). 0038 is
`accepted` only because phase 5 owes its auth story, which this doesn't touch.

## Motivation

### The agents already support this; Silo is the one declining

This is not a protocol feature waiting on agent adoption. Both adapters in
Silo's catalog implement the agent half today, each gated on a capability Silo
does not send:

| Adapter                   | Gate                                                                    | What it unlocks                          |
| ------------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| `claude-agent-acp` 0.75.1 | `acp-agent.js:5267` — `clientCapabilities?.elicitation?.form`           | Claude's built-in `AskUserQuestion` tool |
| `codex-acp` 1.10.0        | `dist/index.js:25865` — `clientCapabilities?.elicitation?.form != null` | MCP-server-originated elicitations       |

Claude's adapter carries a whole `dist/elicitation.js` module whose
`askUserQuestionsToCreateRequest` maps the tool's questions onto an ACP form:
single-select as a titled `oneOf`, multi-select as an `anyOf` item enum, option
secondary text as the enum option's `description`, and — per question — its own
optional free-text "Other" field. The comment at the gate says what happens
without the capability: AskUserQuestion "is surfaced to us as a normal
permission check", i.e. the flat option list Silo renders today.

So the richest question UX Claude has is reaching Silo pre-flattened, and the
reason is one key in one object.

### What Silo sends and does today

- `acp-jsonrpc.ts:633` — `initialize` sends
  `clientCapabilities: { fs: {...}, terminal: false, _meta }`. No `elicitation`.
- `handleServerRequest` (`acp-jsonrpc.ts:514`) special-cases exactly one inbound
  request, `session/request_permission` (`:520`). `elicitation/create` is not
  even in `DECLINED_METHOD_PREFIXES` (`:351`) — it falls through the
  "unknown method" branch to `-32601`, which per recon Finding 2 a compliant
  agent survives, but only by abandoning the question.

### A question is not a permission request

The permission contract is a flat `options: { optionId, name, kind }[]` —
one choice, one answer. A form elicitation is strictly richer in ways that
cannot be flattened without losing the user's actual intent:

- **several questions in one ask**, each with its own header and prompt;
- **multi-select** answers, not just one-of;
- a **per-question free-text answer** ("Other") that overrides the selection;
- **descriptions** on options, and a `preview` (mockups, code snippets) the
  adapter forwards under `_meta`.

Flattening that to buttons doesn't just look worse — it produces a wrong
`content` payload for anything but the single-question single-select case.

`docs/acp-coverage.md` ranks elicitation **#1** of the five unused-feature
clusters (size M, gate "none — build it"). This RFC exists because the feature
crosses the ACP client, the Chat panel, the activity model, and the public SDK
surface at once, which is proposal territory under the change-planning
convention even where the coverage doc records no gate.

## Design

### 1. Capability

`initialize` gains `elicitation: { form: true }`. **Form mode only** — `url`
mode is deferred (see Alternatives); Claude uses it exclusively for the MCP
OAuth handoff (`acp-agent.js:594`), which needs an external-browser flow and the
`elicitation/complete` notification, and has nothing to do with asking the user
a question.

Both adapters' gates are satisfied by `form` alone.

### 2. Protocol handling

`handleServerRequest` gains `elicitation/create` as its second named inbound
request, parsed as defensively as the permission parser already is (every field
may be missing or mistyped) into an `AcpElicitationRequest`. The responder is
one-shot in the same way, answering the protocol's three actions:

```ts
type AcpElicitationOutcome =
  | { action: "accept"; content: Record<string, unknown> }
  | { action: "decline" }
  | { action: "cancel" };
```

The semantics differ meaningfully and both adapters rely on it:
**`decline`** means _the user skipped_ — Claude's `applyAskElicitationResponse`
returns empty answers and the turn continues; **`cancel`** aborts the tool call.

### 3. The schema subset Silo renders

The real design decision. Silo does **not** become a general JSON Schema form
renderer. It renders the shape the bridges actually emit:

| Schema shape                                  | Control                               |
| --------------------------------------------- | ------------------------------------- |
| `type: "object"` with flat `properties`       | the form                              |
| `type: "string"` + `oneOf: EnumOption[]`      | single-select                         |
| `type: "array"` + `items.anyOf: EnumOption[]` | multi-select                          |
| `type: "string"` (no enum)                    | free text                             |
| field `title` / `description`                 | field label / prompt                  |
| option `const` / `title` / `description`      | answer value / label / secondary text |

Two details are worth honouring deliberately:

- **`_askUserQuestionCustomAnswer`.** The adapter authors left this `_meta` key
  _un-namespaced on purpose_ — the comment in `elicitation.js` says it is so
  "ACP clients can recognize the same marker across Codex, Claude, and other
  AskUserQuestion bridges". It names the `questionId` the free-text field
  belongs to. Silo should read it and render the "Other" box **inline under its
  own select**, not as a sibling field, which is what it looks like structurally.
- **`_claude/askUserQuestionOption.preview`** is ignored in phase 1 and noted on
  the roadmap. It's agent-namespaced and its content is freeform.

**Every question always reaches the user.** There is no schema shape that makes
Silo skip a question or answer on the user's behalf — an unrecognized field
degrades its _control_, never its visibility. The ladder, by declared `type`:

| Declared type                       | Control                                 |
| ----------------------------------- | --------------------------------------- |
| one of the enum shapes above        | select / multi-select                   |
| `"boolean"`                         | checkbox                                |
| `"number"` / `"integer"`            | numeric input, coerced back to a number |
| `"string"`, absent, or unrecognized | free text                               |

And the backstop: if `requestedSchema` isn't an object, or carries no usable
`properties` at all, Silo renders the elicitation's `message` with accept /
decline / cancel and **no input field**. The `message` always carries the human
question — both bridges populate it — so the user still sees the ask and still
answers deliberately. There is no text box here for a concrete reason: with no
property key, there is nowhere in `content` to put typed text, and an empty
`content` is the correct and complete answer to a form that names no fields.
A box whose contents the agent could never read would be a worse lie than its
absence.

Free text is not a degraded guess in this protocol: it is the same answer shape
the AskUserQuestion bridge's own "Other" box produces, and
`applyAskElicitationResponse` reads a typed custom answer _in preference to_ a
selection. An unknown field answered as text is a first-class answer.

The one honest caveat is coercion. Coerce by **declared** type where a type is
declared: Claude's `acceptedElicitationContent` runs a validating guard and
yields **empty content** on a malformed accept, so stringifying a declared
`number` would silently throw the user's answer away. Where no type is declared
a string is the only defensible choice, and an agent that rejects it is an
agent whose schema we should then learn to render.

`decline` stays what the protocol means by it — **the user's** choice to skip,
the same Skip the built-in tool always offers. It is never Silo deciding on
their behalf.

### 4. Activity: widen `blocked`, don't fork it

`AgentActivity` is unchanged. `docs/domain-language.md`'s **Activity** entry and
the SDK TSDoc both widen from the permission-specific wording to "stalled
awaiting a user answer — a permission request or a question". Every property
`blocked` carries today already holds for an elicitation: the turn cannot
proceed, the cause is unambiguous, and the chrome should never be suppressed.

The implementation seam is the bookkeeping already inside `onPermission`
(`acp-sessions-service.ts:959`–`1015`), which is non-obvious and must not be
re-derived by copy-paste:

- answer **`cancel`** immediately if the session is disposed, or if no listener
  is registered — the agent is never left hanging (mirrors permission's
  `cancelled` default);
- set `needsAttention` **only** if this session isn't the active one;
- set `activity: "blocked"` **unconditionally** — it should read "waiting on
  you" even on the session you're looking at;
- on answer, clear attention, set `"working"`, and call `noteAgentActivity()` to
  **adopt the turn** — an elicitation arriving outside any `prompt` belongs to a
  turn the agent started itself, and without adoption the session reads
  "working" until its process dies;
- a listener that answers **synchronously** must not raise attention or sound at
  all.

Extract that as one shared helper both callbacks drive, rather than duplicating
six subtle rules.

### 5. Public surface

Mirroring the permission pair on `AgentSessionHandle`:

```ts
interface AgentElicitationRequest {
  readonly message: string;
  readonly questions: readonly AgentElicitationQuestion[];
  readonly toolCallId?: string;
  readonly raw: Readonly<Record<string, unknown>>;
  /**
   * Idempotent; first call wins, and mutually exclusive with the two below.
   *
   * Corrected in phase 4 from the original `Record<string, string | readonly
   * string[]>` sketch, which cannot express a boolean answer, a number, or a
   * custom-answer override — all three of which the parser produces and the
   * protocol needs coerced. An answer is `{ value?, custom? }`.
   */
  respond(
    answers: Readonly<Record<string, AgentElicitationAnswer>>,
  ): void;
  decline(): void;
  cancel(): void;
}

onElicitation(listener: (request: AgentElicitationRequest) => void): Disposable;
```

Note the surface is the **parsed questions**, not the raw JSON Schema — an
extension building its own chat UI should not have to reimplement the schema
subset above, and `raw` is there for one that wants to. This follows
`AgentPermissionRequest`, which likewise offers parsed `options` plus `raw`.

### 6. Auto Accept must not answer questions

RFC 0047's Auto Accept is scoped to **permission requests only**, and this RFC
states that explicitly so a later reader doesn't "fix" the asymmetry. There is
no safe answer to invent for a question: picking one would put words in the
user's mouth and record them as the tool's answer. This is the same reasoning
already written at `AcpChatPanel.tsx:1748` for a permission request that is "a
genuine chooser" — nothing safe to guess, so it surfaces normally.

### 7. Sequencing

The constraint is about **enablement, not authorship**. Advertising the
capability alone is a regression — Claude's AskUserQuestion stops arriving as a
permission request (which works today) and starts arriving as an
`elicitation/create` that Silo answers `-32601`. But the capability flag is the
only switch, so everything behind it can land **dark and inert**: no agent sends
an elicitation until we advertise. That makes one risky change five safe ones.

| Phase                                          | Scope                                                                                                                                    | Inert?                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **1 — Tooltip** ✅ shipped                     | `deriveTab`'s `"Waiting for permission"` → `"Waiting for you"`, plus a test pinning it.                                                  | n/a — correct for permissions today    |
| **2 — Shared blocked bookkeeping** ✅ shipped  | `raiseBlockedOnUser` / `clearBlockedOnUser` extracted from `onPermission`; coverage added for turn adoption and post-dispose arrival.    | **no** — refactored shipped behavior   |
| **3 — Schema parser** ✅ shipped               | Pure host-side functions: recognized shapes, custom-answer pairing, the fallback ladder, the no-`properties` backstop. Wired to nothing. | yes                                    |
| **4 — Host plumbing + SDK surface** ✅ shipped | `elicitation/create` in `handleServerRequest`, the request/outcome types, `onElicitation` on the handle, `pnpm docs:api`.                | yes — reachable but unreached          |
| **5 — Renderer, then the flip**                | The form card on the SDK kit; then `elicitation: { form: true }` and the doc obligations below.                                          | the flip is the only user-visible step |

Phase 2 is the one to watch. It is a pure refactor of shipped, subtle logic, so
it lands **alone** with permission behavior provably unchanged — when something
breaks later, that isolates it from the new feature.

**Verification of phase 5 needs a real agent.** Unit tests cover the parser, but
the form itself needs a genuine `elicitation/create`: flip the capability
locally and prompt Claude to ask a multi-question choice. A fixture written from
reading `askUserQuestionsToCreateRequest`'s source cannot catch a wrong
assumption about the real wire shape — which is the whole risk this phase
carries.

### 8. Obligations that ride along

- `agent-view.ts:99` — `deriveTab`'s `"Waiting for permission"` tooltip becomes
  `"Waiting for you"`, with a test that pins it (it is the one piece of shipped
  chrome a question makes incorrect).
- `docs/domain-language.md` — widen **Activity**'s `blocked`; add
  **Elicitation** / **Question** as a term (user-facing name: _question_; the
  protocol name stays out of the UI, per 0038's rejected "name it ACP").
- `apps/docs/roadmap.md` — `planned` entry for `onElicitation`, flipped to
  `stable` on landing; a `planned` row for option `preview`.
- `pnpm docs:api` + the hand-authored `ctx` member page, per
  `silo-docs-sync`.
- `docs/acp-coverage.md` — re-rank the Top 5 once this lands.
- Unit tests in the same change: the schema parser (each recognized shape, the
  custom-answer pairing, every rung of the fallback ladder, and the
  no-usable-`properties` backstop), the shared blocked-bookkeeping helper, and
  the `content` round-trip including type coercion.

## Alternatives considered

- **A new `AgentActivity` value (`"asking"`).** Rejected. It's a public enum
  change that forces every consumer to branch, and no consumer would render it
  differently from `blocked` — `agents-panel.tsx:243` maps `blocked` to amber
  "waiting on a human", which is exactly right for a question.
- **A `blockedReason?: "permission" | "question"` field on `AgentInfo`.**
  Deferred. It would let the tab tooltip and status row say _which_ kind of
  answer is wanted, which is genuinely more useful than `"Waiting for you"` —
  but it grows the public surface for one string, when the user finds out by
  opening the tab they were already being pointed at. Revisit if the generic
  wording reads as too vague in practice; the field is additive and this RFC
  does not foreclose it.
- **Reuse the permission card, flattening the form to buttons.** Rejected. It
  works only for the single-question single-select case and silently submits
  wrong answers for the rest; it is also what we already have.
- **A general JSON Schema form renderer.** Deferred — but note the fallback
  ladder means Silo renders an _answerable_ control for any schema, not just the
  recognized ones. What's deferred is rich controls for shapes no agent emits
  yet (nested objects, `pattern` validation), not the user's ability to answer.
- **Declining a question whose schema Silo can't fully render.** Rejected. It
  silently costs the user a question they never saw, to avoid a wrong `content`
  payload — but a free-text answer is already a valid payload in this protocol,
  so the tradeoff was never real. The only thing Silo should refuse to do is
  invent an answer.
- **Also declare `elicitation.url`.** Deferred. It is the MCP OAuth handoff, not
  a question: it needs external-browser launch, a stable `elicitationId`, and the
  inbound `elicitation/complete` notification. Orthogonal, and worth its own
  change.
- **Leave AskUserQuestion on the permission path.** Rejected — it is the status
  quo, and it degrades the one structured-question UX our primary agent already
  speaks.

## Decision

Open. Draft for review.
