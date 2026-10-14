# Tasks — 0062. Agent questions (ACP elicitation)

**Phase 5: the form card, then the flip.** Phases 1–4 shipped
(#623, #622, #625, #626). This is the user-visible phase.

> **Not collapsed, and `proposal.md` is still `accepted` rather than
> `implemented`, for one reason:** R4 requires verification against a **real
> agent**, and that has not happened. Everything below is unit-verified and
> the capability is flipped, but no live `elicitation/create` has been seen.
> See "Outstanding" at the bottom — that step needs the app run by hand.

## Form model (`question-form.ts`)

- [x] `QuestionFormState` + `initialFormState`, with **one** representation of
      "unanswered" (no key) so `isAnswered` has a single thing to read.
- [x] `setAnswerValue`, `toggleMultiSelect`, `setCustomAnswer`.
- [x] `isOptionSelected` / `controlValue` / `customValue` for the controls.
- [x] `isAnswered`: blank text, blank custom, empty selection and an
      unparseable number all read as unanswered; `false` reads as answered.
- [x] `canSubmit`: at least one answer, or an acknowledge-only request.
- [x] `answeredCount` for the "n of m answered" hint.

## The card (`AcpChatPanel.tsx`)

- [x] `handle.onElicitation` → a `PendingQuestion` per request, each owning its
      own form (two can be open at once).
- [x] `QuestionField` renders by kind: `RadioGroup`/`RadioCard` for select,
      `CheckboxRow` for multi-select, `Input` for text/number.
- [x] `boolean` is a **Yes/No chooser**, not a `Switch` — a toggle has no
      "untouched" position, so it would submit an answer never given.
- [x] The `custom` box renders inline under its own question, with the
      companion's label and description.
- [x] `acknowledgeOnly` → message plus actions, no inputs.
- [x] Send / Skip / Cancel, each with an SDK `Tooltip` explaining what the
      agent does with it. Send disabled until something is answered.
- [x] Answering retires the card; `respond`/`decline`/`cancel` are idempotent
      underneath, so a double click cannot answer twice.
- [x] Auto Accept deliberately not applied (RFC 0047 is permission-only).
- [x] Stale questions cleared when a turn ends, like permissions.
- [x] Transcript stays pinned to the bottom when a card appears.
- [x] CSS: design tokens only (stylelint clean), no hand-rolled focus styles,
      no native `title` attributes.

## The flip

- [x] `initialize` sends `elicitation: { form: true }` — form only, `url`
      deliberately absent.
- [x] Landed in the **same change** as the renderer.

## Docs

- [x] `apps/docs/roadmap.md` — `onElicitation` folded into the shipped Chat
      sessions row; option `preview` stays `planned`.
- [x] `docs/acp-coverage.md` — elicitation out of the Top 5, `session/delete`
      promoted into the freed slot, per-method tables updated, and the
      remaining url-mode gap recorded as deferred by decision.
- [x] `apps/docs/guide/agent-sessions.md` — the feature in the Chat panel list
      plus a compatibility row.

## Tests

- [x] 24 cases over the form model: every kind, both omission rules, the
      custom-answer interactions, and `canSubmit`'s gate.
- [x] The capability flip pinned against **both adapters' real gates**
      (`clientCapabilities?.elicitation?.form` and the `!= null` variant), plus
      that `url` is absent and that `elicitation` sits where the ACP SDK's
      schema will not strip it.
- [x] Vacuity check: 9 single-branch mutations, each producing a matching
      failure. One gap found and closed — see Notes.

## Verification

- [x] `pnpm test` (11/11 tasks), `pnpm --filter silo exec tsc --noEmit`,
      `pnpm lint` (incl. stylelint) all pass.
- [x] No ADR needed: the kit choices follow `docs/modal-design.md` and the
      inline-not-modal decision is the permission card's, already recorded.
- [ ] **R4: verified against a real agent.** Outstanding — see below.
- [ ] Collapse the package and set `status: implemented`. Blocked on the above.

## Outstanding — the real-agent run

Unit tests cannot close this. The fixtures were written by reading
`claude-agent-acp`'s `elicitation.js`, so they can only confirm Silo agrees
with that reading; a wrong assumption about what the agent actually sends looks
identical to a pass. What to do, with the dev app running:

1. Prompt Claude so it reaches for `AskUserQuestion` — something with a genuine
   choice in it ("ask me which database and which features to scaffold").
2. Confirm: the card renders, the agent shows `blocked` / amber, the tab says
   "Waiting for you", and the chime fires when the panel is not focused.
3. Answer one question and skip the other; confirm the agent proceeds with the
   partial answers rather than discarding them.
4. Type into an "Other" box with an option also selected; confirm the typed
   text is what the agent acts on.
5. Separately exercise **Skip** (the turn should continue) and **Cancel** (the
   tool call should abort) — they are different protocol answers and only a
   real agent shows the difference.
6. Watch Output → **Agents** for a `url-mode` line; none should appear.

## Notes from implementation

- **The flip shipped wrong the first time, and only the real agent caught it.**
  `ElicitationFormCapabilities` is a marker _object_ — the schema's own words
  are "supplying `{}` means the client supports it" — and the ACP SDK parses it
  with `defaultOnError(..., () => undefined)`. So `form: true` was not
  rejected; it was **silently dropped in transit**. The agent saw no form
  support, put `AskUserQuestion` into `disallowedTools`
  (`acp-agent.js:5878`), and Claude correctly reported having no such tool.
  Fixed to `form: {}`.

  The original unit test ran both adapters' gates over the object we _meant_ to
  send and passed — it could not see the value being discarded between us and
  them. It is replaced by one that models the SDK's parse and asserts against
  what survives it, plus a guard-the-guard case pinning that `form: true`
  reduces to `undefined`. Reverting the fix now fails that test.

  This is the precise failure the proposal predicted for phase 5 ("a fixture
  written from reading the source cannot catch a wrong assumption about the
  real wire shape") — worth keeping as the argument for why the real-agent run
  is a requirement rather than a formality.

- **One vacuity gap, now closed.** `isAnswered`'s blank-custom guard looked
  double-guarded by the state-pruning in `patch`, but it is reachable: a text
  question holding whitespace _plus_ a blank custom box keeps its key and must
  still read as unanswered. Test added.
- **`boolean` renders as Yes/No, not a toggle.** The only design decision in
  this phase that isn't copied from the permission card, and it follows from
  the RFC's core rule rather than from the kit: a `Switch` or checkbox always
  looks answered, so an untouched one would tell the agent something the user
  never said.
- **Send is gated on one answer** because with nothing answered, accepting
  sends byte-identical content to Skip — and Skip names that honestly. Partial
  answers stay legitimate; the bridge marks nothing required.
