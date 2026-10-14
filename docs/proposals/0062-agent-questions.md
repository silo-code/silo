---
status: implemented
created: 2026-10-14
---

# 0062. Agent questions (ACP elicitation)

## Summary

A Chat agent can ask the user a **real structured question** — several prompts
in one ask, single- or multi-select, free text, each with its own optional
"Other" box — instead of the flat row of permission buttons it used to be
flattened onto. Silo advertises `ClientCapabilities.elicitation.form`, handles
the inbound `elicitation/create`, renders it as a question card inline in the
Chat transcript, and exposes it on the public surface as
`AgentSessionHandle.onElicitation`.

While the card is open the agent's `AgentActivity` is the existing
**`"blocked"`**, widened from "stalled on a permission request" to "stalled
awaiting a user answer" rather than given a new enum value.

Claude's built-in `AskUserQuestion` becomes one of these.

## Motivation

The agents already supported this; Silo was the one declining. Both adapters in
the catalog implement the agent half, each gated on a capability Silo did not
send:

| Adapter                   | Gate                                    | What it unlocks                          |
| ------------------------- | --------------------------------------- | ---------------------------------------- |
| `claude-agent-acp` 0.75.1 | `clientCapabilities?.elicitation?.form` | Claude's built-in `AskUserQuestion` tool |
| `codex-acp` 1.10.0        | `...elicitation?.form != null`          | MCP-server-originated elicitations       |

So the richest question UX Claude has was reaching Silo pre-flattened, and the
reason was one key in one object.

**A question is not a permission request.** The permission contract is a flat
`options: { optionId, name, kind }[]` — one choice, one answer. A form
elicitation is richer in ways that cannot be flattened without losing the
user's intent: several questions per ask, multi-select answers, a per-question
free-text answer that _overrides_ the selection, and option descriptions.
Flattening produces a wrong `content` payload for anything but the
single-question single-select case.

## What was built

### The schema subset

Silo is **not** a general JSON Schema form renderer. It renders the shape the
bridges actually emit:

| Schema shape                                  | Control       |
| --------------------------------------------- | ------------- |
| `type: "string"` + `oneOf: EnumOption[]`      | single-select |
| `type: "array"` + `items.anyOf: EnumOption[]` | multi-select  |
| `type: "string"` (no enum)                    | free text     |
| `"boolean"`                                   | Yes/No        |
| `"number"` / `"integer"`                      | numeric input |
| absent or unrecognized                        | free text     |

**Every question always reaches the user.** No schema shape makes Silo skip a
question or answer on the user's behalf — an unrecognized field degrades its
_control_, never its visibility. Free text is not a degraded guess in this
protocol: it is the same answer shape the bridge's own "Other" box produces,
and the agent reads a typed custom answer _in preference to_ a selection.

The backstop: a `requestedSchema` that is not an object, or carries no usable
`properties`, renders the message with accept / decline / cancel and **no input**
(`acknowledgeOnly`). With no property key there is nowhere to put typed text,
and an empty `content` is the correct and complete answer to a form that names
no fields.

`_askUserQuestionCustomAnswer` — deliberately un-namespaced by the adapter
authors so clients recognize it across bridges — names the `questionId` its
free-text field belongs to. Silo folds it in **under its own question**, not
beside it as the schema literally has it.

### The three answers

`respond` / `decline` / `cancel` are distinct because the adapters act on them
differently: **`decline`** is the user's deliberate _skip_ — the agent gets
empty answers and the turn continues — while **`cancel`** aborts the tool call.
The card offers all three as Send / Skip / Cancel.

### Activity

`AgentActivity` is unchanged. `blocked` widened instead of forking, because the
presentation pattern was already built, correct, and reason-agnostic: the amber
pulsing row, the chime on `startedBlocking`, `needsAttention` when unfocused,
and the "Waiting for you" tab tooltip all apply unchanged. One shared helper
pair — `raiseBlockedOnUser` / `clearBlockedOnUser` — is driven by **both**
`onPermission` and `onElicitation`, so there is exactly one copy of the six
subtle rules (cancel when disposed or unlistened; attention only when not
active; `blocked` unconditionally; a synchronous answer raises nothing; answer
adopts the turn via `noteAgentActivity()`).

Plan approval (`ExitPlanMode`) stays on the permission path — the adapter gates
elicitation on the tool _name_, so it routes through `onPermission` and
inherits the same status. All three "requiring user input" cases converge on
the one helper.

## Decisions worth keeping

- **Widen `blocked`, don't add an enum value.** A new `AgentActivity` would
  force every consumer to branch, and no consumer would render the branches
  differently. Rejected for that reason; `blockedReason` was deferred, not
  foreclosed, if the generic wording ever reads as too vague.
- **`elicitation.form` must be `{}`, not `true`.** `ElicitationFormCapabilities`
  is a marker _object_ — "supplying `{}` means the client supports it" — parsed
  by the ACP SDK with `defaultOnError(..., () => undefined)`. A boolean does not
  fail loudly; it is **silently discarded in transit**, the agent sees no form
  support, and it puts `AskUserQuestion` into `disallowedTools`, removing the
  tool from Claude's tool list entirely. This shipped wrong and only the
  real-agent run caught it — the unit test ran both adapters' gates over the
  object we _meant_ to send, never over what the schema leaves of it.
- **The response is not shaped like the permission response.**
  `session/request_permission` answers `{ outcome: { ... } }`;
  `elicitation/create` answers `{ action, content? }` at the **top level**.
  Nesting it reads to the agent's validating guard as a malformed accept, which
  yields _empty content_ — silently discarding every answer.
- **Omit rather than guess, on serialize.** An unparseable number, a blank
  number field (`Number("")` is `0` — a value the user never typed), and an
  unreadable boolean are each dropped. The agent validates an accepted payload
  as a whole, so one bad key would discard the user's other answers too.
- **`boolean` renders as Yes/No cards, not a `Switch`.** A toggle has no "not
  yet answered" position, so an untouched one would submit an answer the user
  never gave — the one thing this whole change refuses to do.
- **Send is disabled until one question is answered.** With nothing answered,
  accepting sends byte-identical content to Skip, and Skip names that honestly.
  Partial answers stay legitimate; the bridge marks nothing required.
- **Auto Accept (RFC 0047) stays permission-only.** There is no safe answer to
  invent for a question; guessing would put words in the user's mouth and
  record them as the tool's answer. Stated in the public TSDoc so a later
  reader does not "fix" the asymmetry.
- **The public surface is parsed questions, not raw JSON Schema** — an
  extension building its own chat UI should not reimplement the schema subset.
  `raw` is there for one that wants more, following `AgentPermissionRequest`.
- **Form mode only.** `url` mode is the MCP OAuth handoff, not a question: it
  needs an external-browser launch, a stable `elicitationId`, and the inbound
  `elicitation/complete` notification. Not advertised; a url-mode request is
  answered `cancel`.

## Phases

All five shipped. The sequencing mattered: advertising the capability _moves_
`AskUserQuestion` off the permission path, so the flip is a regression until a
renderer exists. Everything behind it could therefore land dark — one risky
change became five safe ones.

| Phase                           | Scope                                                          | PR   |
| ------------------------------- | -------------------------------------------------------------- | ---- |
| 1 — Tooltip                     | `deriveTab`'s `"Waiting for permission"` → `"Waiting for you"` | —    |
| 2 — Shared blocked bookkeeping  | `raiseBlockedOnUser` / `clearBlockedOnUser` extracted          | #622 |
| 3 — Schema parser               | `elicitation-schema.ts`, pure and total, wired to nothing      | #625 |
| 4 — Host plumbing + SDK surface | `elicitation/create`, `onElicitation`, the public types        | #626 |
| 5 — Renderer, then the flip     | The question card, then `elicitation: { form: {} }`            | —    |

## Implementation

| Piece                      | Where                                                                       |
| -------------------------- | --------------------------------------------------------------------------- |
| Schema parser / serializer | `packages/extension-host/.../agents/elicitation-schema.ts`                  |
| Protocol handling + flip   | `packages/extension-host/.../agents/acp-jsonrpc.ts`                         |
| Blocked bookkeeping, `ctx` | `packages/extension-host/.../agents/acp-sessions-service.ts`                |
| Public surface             | `packages/sdk/src/agents-service.ts` (`AgentElicitation*`, `onElicitation`) |
| Form state (pure)          | `packages/extensions-silo/src/agents-chat-panel/question-form.ts`           |
| The card                   | `packages/extensions-silo/src/agents-chat-panel/AcpChatPanel.tsx`           |

No ADR was owed: the model follows `AgentPermissionRequest`'s
parsed-fields-plus-`raw` precedent (RFC 0038), and the inline-not-modal
placement is the permission card's existing decision. Related:
[RFC 0038](./0038-acp-agent-sessions.md) (Chat sessions),
[RFC 0047](./0047-yolo-mode.md) (Auto Accept),
[RFC 0044](./0044-terminal-agent-permission-block-detection.md) (the same
signal for PTY agents — still open).

## Verification

Unit-tested throughout, and **verified against a real agent** — which is what
caught the `form: true` bug that every unit test had agreed with. A fixture
written by reading an adapter's source can only confirm Silo agrees with that
reading; it cannot catch a wrong assumption about the wire. That is the lasting
argument for the live run being a requirement rather than a formality.

Each phase also ran a vacuity check (break a branch, watch the matching test
fail, restore), which closed three tests that could not have failed.

## Deferred

- **`url`-mode elicitation** and `elicitation/complete` — the MCP OAuth handoff.
  Orthogonal; worth its own change. Recorded in `docs/acp-coverage.md`.
- **Option `preview`** (`_claude/askUserQuestionOption`) — parsed through to
  `raw` with no model field until a renderer wants it. Roadmap row stays
  `planned`.
- **`boolean` / `number` controls are built but unexercised live.**
  `askUserQuestionsToCreateRequest` only ever emits single- and multi-select,
  so Claude cannot produce them; they would need an MCP server that elicits.
- **`blockedReason`** on `AgentInfo` — would let the status say _which_ kind of
  answer is wanted. Additive; deferred, not foreclosed.
