# Tasks — 0062. Agent questions (ACP elicitation)

**Phase 3 only: the schema parser.** One module, one test file, nothing wired.

## Model

- [ ] `elicitation-schema.ts`: `ElicitationOption`, `ElicitationQuestion`
      (closed `kind` union), `ParsedElicitation`.
- [ ] Capture the enum-option mapping once (`const` → `value`,
      `title ?? const` → `label`, `description` carried) — it is shared by the
      `oneOf` and `items.anyOf` paths and must not drift between them.

## Parser

- [ ] `parseElicitation(params)`, total, in schema-property order.
- [ ] Classify by declared `type`; unknown or absent → `"text"` (R3).
- [ ] Treat a malformed enum (empty, or no usable `const`) as `"text"`, not as
      an optionless select (R3).
- [ ] Two passes so a custom-answer companion that _precedes_ its target still
      attaches (R2); a companion naming an unknown `questionId` becomes an
      ordinary text question.
- [ ] Non-object schema, or no usable `properties` → `questions: []` and
      `acknowledgeOnly: true` (R3).
- [ ] Single-question form with no `description` falls back to the
      elicitation's `message` as the prompt (R1).

## Serializer

- [ ] `toElicitationContent(questions, answers)` with an exhaustive `switch`
      over `kind`.
- [ ] Omit unanswered questions and unparseable numbers (R4).
- [ ] Write a non-empty custom answer to the **companion's** field key (R4).

## Tests

- [ ] One case per recognized shape and per fallback rung.
- [ ] Companion attachment: normal, preceding its target, unknown target.
- [ ] Serializer coercions and both omission rules.
- [ ] Round-trip fixture from Claude's real `askUserQuestionsToCreateRequest`
      output — two questions, one multi-select, both with companions.
- [ ] Confirm the suite is not vacuous: break one branch in the source, watch
      the matching test fail, restore. Note anything that turns out to be
      unreachable or double-guarded rather than leaving a test that cannot
      fail.

## Verification

- [ ] Every requirement in `requirements.md` is met or explicitly noted as not.
- [ ] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, and `pnpm lint` pass.
- [ ] The module is imported by nothing — phase 3 is inert by construction.
- [ ] No ADR needed unless the model turns out to need a durable decision;
      say so either way.
- [ ] **Do not collapse the package** — phases 4 and 5 remain. Re-scope
      `requirements.md` / `design.md` / `tasks.md` for phase 4, or collapse to
      a curated `0062-agent-questions.md` with the phase table updated and
      `status: accepted` if stopping here for a while.
