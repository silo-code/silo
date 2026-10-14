# Requirements — 0062. Agent questions (ACP elicitation)

**Phase 5: the form card, then the flip.** Phases 1–4 have shipped. This is
the only user-visible phase and the only one that can regress behavior that
works today.

The deliverable is a form in the Chat transcript that renders a parsed
question, collects answers, and answers the agent — and then
`clientCapabilities.elicitation.form`, which is what makes any of it happen.

## R1 — Every question kind renders an answerable control

Built on the `@silo-code/sdk` kit, inline in the transcript.

### Acceptance criteria

- [ ] `select` → stacked option cards (`RadioGroup` / `RadioCard`), option
      `description` as the card's secondary line.
- [ ] `multi-select` → `CheckboxRow` per option.
- [ ] `text` → `Input`; `number` → a numeric `Input`.
- [ ] `boolean` → a **two-option Yes/No chooser**, not a `Switch` or a bare
      checkbox. A toggle has no "not yet answered" state, so an untouched one
      would submit an answer the user never gave — the one thing this RFC
      refuses to do.
- [ ] A question's `custom` box renders **inline under its own options**, with
      the companion's own label and description, not as a sibling field.
- [ ] `acknowledgeOnly` renders the message and the actions with **no input**.
- [ ] Several questions in one request render as one card with one submit.

## R2 — The card never invents an answer

### Acceptance criteria

- [ ] No control starts in an answered state. An untouched question
      contributes no key, inherited from `toElicitationContent`.
- [ ] **Send** is disabled until at least one question is answered — with
      nothing answered, Skip is the honest action and sends the same thing.
- [ ] **Skip** (`decline`) and **Cancel** (`cancel`) are offered distinctly,
      because they mean different things to the agent: Skip continues the turn
      with empty answers, Cancel aborts the tool call.
- [ ] Auto Accept never answers a question (RFC 0047 is permission-only).
- [ ] Answering removes the card; the same request can never be answered twice.

## R3 — The form is in the transcript, not a modal

### Acceptance criteria

- [ ] Rendered inline in the transcript flow, like the permission card and for
      the same reason: a modal would hide the conversation that explains what
      is being asked and block the rest of the app.
- [ ] Styled with **design tokens only** — no hard-coded colors, fonts or px
      sizes (the stylelint rule covers this).
- [ ] Any hover hint uses the SDK `Tooltip`, never a native `title`.
- [ ] No hand-rolled focus styles — the global `:focus-visible` ring applies.

## R4 — The capability flip is last and deliberate

### Acceptance criteria

- [ ] `initialize` sends `elicitation: { form: true }` — **form only**.
- [ ] It lands in the same change as the renderer. Advertising it without a
      renderer turns Claude's working `AskUserQuestion` into `-32601`: the
      capability _moves_ the tool off the permission path.
- [ ] Verified against a real agent, not only unit tests — a fixture cannot
      catch a wrong assumption about what the agent actually sends.

## R5 — Docs catch up with reality

### Acceptance criteria

- [ ] `apps/docs/roadmap.md` — `onElicitation` flipped `planned` → `stable`.
- [ ] `docs/acp-coverage.md` — elicitation re-ranked out of the Top 5.
- [ ] The Chat user guide gains the feature.
- [ ] `proposal.md` → `status: implemented`, and the package collapses to one
      curated file (every phase it commits to will have shipped).

## Out of scope

- `url`-mode elicitation and `elicitation/complete` — deferred entirely.
- Option `preview` rendering — stays reachable only through `raw` until a
  renderer wants it; the roadmap row stays `planned`.
- Terminal-kind agents: a PTY agent speaks no ACP, so never an elicitation
  (RFC 0044 is the separate problem).
