# Tasks — 0062. Agent questions (ACP elicitation)

**Phase 3 only: the schema parser.** One module, one test file, nothing wired.

## Model

- [x] `elicitation-schema.ts`: `ElicitationOption`, `ElicitationQuestion`
      (closed `kind` union), `ParsedElicitation`.
- [x] Capture the enum-option mapping once (`const` → `value`,
      `title ?? const` → `label`, `description` carried) — it is shared by the
      `oneOf` and `items.anyOf` paths and must not drift between them.
      (`parseEnumOptions`.)

## Parser

- [x] `parseElicitation(params)`, total, in schema-property order.
- [x] Classify by declared `type`; unknown or absent → `"text"` (R3).
- [x] Treat a malformed enum (empty, or no usable `const`) as `"text"`, not as
      an optionless select (R3).
- [x] Two passes so a custom-answer companion that _precedes_ its target still
      attaches (R2); a companion naming an unknown `questionId` becomes an
      ordinary text question — in its own schema position, not appended.
- [x] Non-object schema, or no usable `properties` → `questions: []` and
      `acknowledgeOnly: true` (R3).
- [x] Single-question form with no `description` falls back to the
      elicitation's `message` as the prompt (R1).

## Serializer

- [x] `toElicitationContent(questions, answers)` with an exhaustive `switch`
      over `kind`.
- [x] Omit unanswered questions and unparseable numbers (R4).
- [x] Write a non-empty custom answer to the **companion's** field key (R4).

## Tests

- [x] One case per recognized shape and per fallback rung.
- [x] Companion attachment: normal, preceding its target, unknown target,
      no `questionId` at all, and a second companion claiming a paired question.
- [x] Serializer coercions and both omission rules.
- [x] Round-trip fixture from Claude's real `askUserQuestionsToCreateRequest`
      output — two questions, one multi-select, both with companions — plus the
      single-question shape (prompt in `message`, field `description`
      `undefined`). The adapter's read-back loop is transcribed into the test as
      `readBackAnswers`, so the assertion is against what
      `applyAskElicitationResponse` actually does with the `content`.
- [x] Confirm the suite is not vacuous: 20 single-branch mutations of the
      source, each producing at least one failure. Two gaps found and closed in
      the process — see Notes.

## Verification

- [x] Every requirement in `requirements.md` is met. One deliberate addition
      beyond the written criteria, noted below (blank-number omission).
- [x] `pnpm test` (2423 tests), `pnpm --filter silo exec tsc --noEmit`, and
      `pnpm lint` pass.
- [x] The module is imported by nothing — grep for `elicitation-schema`,
      `parseElicitation` and `toElicitationContent` outside the two new files
      hits only this planning package. Phase 3 is inert by construction.
- [x] **No ADR needed.** The model is a host-internal parse of a protocol
      payload and follows the precedent already recorded for
      `AcpPermissionRequest` (parsed fields plus `raw`) under RFC 0038. Nothing
      here is a new architectural decision; phase 4's public `ctx` surface is
      where a durable record may be owed.
- [ ] **Do not collapse the package** — phases 4 and 5 remain.

## Notes from implementation

- **`Number("")` is `0`.** The round of serializer tests caught the parser
  sending `ratio: 0` for a number field the user left blank — a value they never
  typed, indistinguishable to the agent from a deliberate zero. A blank or
  whitespace-only value is now treated as unanswered, which is the same rung as
  R4's unparseable-number omission but a distinct branch from it.
- **An unreadable `boolean` is omitted too**, not coerced. R4 names only the
  number case, but `Boolean("false")` is `true`, so guessing here would send the
  opposite of what a stray value suggests. Omission matches the stated reason
  for the number rule.
- **A custom answer on a question with no companion is ignored.** There is no
  field key to write it to, and no renderer can offer that box — `custom` only
  exists on a question the schema paired one with.
- **Two test gaps found by the vacuity check**, both now closed:
  `isRecord`'s array exclusion was unreachable by any assertion (a non-empty
  `properties: []` now pins it), and `toEqual` silently ignores
  `undefined`-valued keys, so "absent stays absent" needed explicit `in`
  checks — the convention `acp-update-model.test.ts` already uses.
- **Judgment call on ambiguous spec wording.** R3's "a schema that is not an
  object" is read structurally (`requestedSchema` is not a record), not as
  `type !== "object"`. A schema carrying usable `properties` but a missing or
  odd `type` discriminator still yields its questions — dropping them would be
  the one outcome the ladder exists to prevent. Likewise a property whose
  _body_ is not an object still becomes a text question: the key is all an
  answer needs.
