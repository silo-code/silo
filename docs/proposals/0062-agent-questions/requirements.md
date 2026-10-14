# Requirements — 0062. Agent questions (ACP elicitation)

**Phase 3 only: the schema parser.** Pure host-side logic, wired to nothing.
Phases 4 (host plumbing + SDK surface) and 5 (renderer + the capability flip)
are out of scope — see `proposal.md`'s Sequencing table.

The deliverable is two pure, total functions and their model: one that turns an
`elicitation/create` `requestedSchema` into a question list, and one that turns
collected answers back into the protocol's `content` object. Both must be
exhaustively testable without a running agent.

## R1 — Every recognized schema shape parses to its control

A `type: "object"` schema with flat `properties` yields one question per
property, in schema order.

### Acceptance criteria

- [ ] `type: "string"` + `oneOf: EnumOption[]` → `kind: "select"` with one
      option per entry, `value` from `const`, `label` from `title` (falling
      back to `const`), `description` carried when present.
- [ ] `type: "array"` + `items.anyOf: EnumOption[]` → `kind: "multi-select"`
      with the same option mapping.
- [ ] `type: "string"` with no enum → `kind: "text"`.
- [ ] `type: "boolean"` → `kind: "boolean"`; `"number"` / `"integer"` →
      `kind: "number"`.
- [ ] A property's `title` and `description` land on the question; a
      single-question form with no `description` falls back to the
      elicitation's own `message` as the prompt.

## R2 — The custom-answer companion attaches to its question, not beside it

A property carrying `_meta._askUserQuestionCustomAnswer` is the free-text
"Other" box for the question named by that marker's `questionId`. It is not a
question of its own.

### Acceptance criteria

- [ ] Such a property never appears as its own entry in the question list.
- [ ] It attaches to the question whose id matches `questionId`, carrying its
      own field key, label and description.
- [ ] A marker naming an unknown `questionId` degrades to an ordinary `text`
      question rather than being dropped.

## R3 — No schema shape costs the user the question

An unrecognized or absent `type` degrades the _control_, never the question's
visibility.

### Acceptance criteria

- [ ] An unknown or missing `type` yields `kind: "text"`.
- [ ] A property whose `oneOf` / `items.anyOf` is present but malformed
      (empty, or no usable `const`) yields `kind: "text"` rather than a select
      with no options.
- [ ] A schema that is not an object, or carries no usable `properties`,
      yields **zero** questions and the `acknowledge` form — the message with
      accept / decline / cancel and no input. (With no property key there is
      nowhere for typed text to go; an empty `content` is the correct and
      complete answer to a form that names no fields.)
- [ ] No input shape causes a throw. The parser is total.

## R4 — Answers round-trip into a valid `content`

Collected answers serialize back to the `content` object the agent reads,
coerced to each property's declared type.

### Acceptance criteria

- [ ] `select` / `text` → string; `multi-select` → array of strings;
      `boolean` → boolean; `number` → number.
- [ ] A `number` answer that does not parse is **omitted** from `content`
      rather than sent as `NaN` or a string — a malformed value would make
      the agent's own validating guard discard the whole payload.
- [ ] A non-empty custom answer writes the **companion's** field key, not the
      question's, because the agent reads the two keys separately and treats a
      typed custom answer as overriding the selection.
- [ ] An unanswered question contributes no key at all.
- [ ] Parsing Claude's real `askUserQuestionsToCreateRequest` output for a
      two-question form (one single-select, one multi-select, each with its
      own custom-answer companion) and serializing a filled answer set
      produces exactly the `content` shape `applyAskElicitationResponse`
      reads back.

## Out of scope

- Advertising `clientCapabilities.elicitation.form` (phase 5 — it is the switch).
- The `elicitation/create` request handler and `onElicitation` (phase 4).
- The SDK types and `pnpm docs:api` (phase 4).
- The form card UI (phase 5).
- `url`-mode elicitation and `elicitation/complete` (deferred entirely).
- Option `preview` under `_claude/askUserQuestionOption` — parsed through to
  `raw` but given no model field until a renderer wants it.
