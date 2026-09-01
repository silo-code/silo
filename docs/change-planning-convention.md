# Change-planning convention

A lightweight way to plan and execute a **substantial** change — with a human,
a coding agent, or both — without a framework, CLI, dependency, or metadata
system. It is ordinary Markdown in `docs/proposals/`, and it is an extension of
the existing [proposal / RFC lifecycle](./proposals/README.md), not a separate
system. The decision to adopt it is
[ADR 0045](./decisions/0045-ephemeral-change-planning.md).

## Why it exists

Substantial work benefits from writing down _what_ must be true, _how_ it will
be built, and _which steps_ get there — before and during implementation. But
those planning notes stop being useful once the code exists: the code and its
tests become the truth of _what the system does_, and the durable _why_ belongs
in a decision record. So planning here is **ephemeral**: it expands a proposal
while the work is active and collapses back to a single curated document when
the work is done.

## The lifecycle

```
idea
  │
  ▼
docs/proposals/NNNN-name.md          Stage 1 — Proposal (single file)
  │   accepted, and real implementation work is about to start
  ▼
docs/proposals/NNNN-name/            Stage 2 — Planning package (temporary)
  ├── proposal.md
  ├── requirements.md
  ├── design.md
  └── tasks.md
  │   implement ──► verify
  ▼
docs/proposals/NNNN-name.md          Stage 5 — Collapse
    status: implemented                (curated, not concatenated)
```

This is the single-pass shape. A change that ships as multiple sequenced
phases loops Stages 2–5 once per phase instead of once total — see
[Multi-phase changes](#multi-phase-changes) below.

Numbering is the same sequence as every other proposal — sequential,
permanent, never reused (`NNNN-kebab-title`). A planning package keeps the
proposal's number; only its _shape_ changes.

Every stage that changes a proposal's shape or status also updates its row in
[`proposals/README.md`](./proposals/README.md) — creating it (stage 1),
repointing the link at `NNNN-name/proposal.md` when a planning package is
expanded, and pointing it back at `NNNN-name.md` when that package is collapsed.
For a multi-phase proposal, a non-final collapse keeps the proposal's existing
status (normally `accepted`); only the final collapse changes it to
`implemented`. A unit test enforces the index shape; see that README's
conventions.

## When to use it

Use the workflow when a change has meaningful:

- product behavior
- architectural or cross-cutting impact
- public API / SDK-surface change
- persistence or data-model change
- significant implementation complexity
- ambiguity that needs explicit decisions

Implement directly — no proposal, no planning package — for typo fixes,
localized bug fixes, obvious CSS/UI adjustments, dependency bumps, small
refactors, and other low-risk changes. This repo already gates the truly small
surface additions at "just a `planned` roadmap entry" (see
[`proposals/README.md`](./proposals/README.md)); that still holds. The goal is
better engineering context, not documentation ceremony — an agent should decide
based on the change, not create planning files because the convention exists.

## Stage 1 — Proposal

A new idea is a single file, `docs/proposals/NNNN-name.md`, using
[`proposals/template.md`](./proposals/template.md). It is lightweight: problem,
motivation, proposed change, rough scope, `status: draft`. It does **not** need
requirements, design, or a task breakdown yet — its job is to capture and
discuss the idea.

## Stage 2 — Planning package

Once the proposal is `accepted` and implementation work is about to begin,
expand the single file into a directory of the same name with four files
(skeletons in [`proposals/planning-template/`](./proposals/planning-template/)):

### `proposal.md`

The human-facing overview — problem, motivation, proposed solution, scope,
alternatives where useful, status. What someone reads to understand the change
without reading the diff. Carries the frontmatter.

### `requirements.md`

The behavioral specification: what the result must do, explicit and testable
where practical, each with acceptance criteria.

```md
## R1 — Task creation

The system must let a user create a task.

### Acceptance criteria

- [ ] A task can be created from the UI.
- [ ] The task receives a unique identifier.
- [ ] The task persists across an application restart.
```

### `design.md`

The technical design for satisfying the requirements — only what's useful for
implementation: architecture, components, data flow, APIs/interfaces,
persistence, error handling, testing strategy, technical constraints, and the
existing ADRs the design must respect. It describes intent; it does not
duplicate the source.

### `tasks.md`

The implementation plan as Markdown checkboxes — concrete, independently
understandable, ordered where dependencies matter, each small enough for an
agent to execute and verify. Working state: keep it current as work proceeds.

```md
- [ ] Add the task model
- [ ] Add persistence
- [ ] Add the create/list API
- [ ] Add tests
```

## Stage 3 — Implementation

Implement against the approved requirements, design, and tasks. While doing so:

1. Follow the existing ADRs (`docs/decisions/`).
2. Don't expand scope without writing down why (in `proposal.md` or `tasks.md`).
3. Check tasks off as they land.
4. Add or update tests in the same change (see `AGENTS.md` → Testing).
5. When implementation contradicts the design, fix the design — don't follow a
   plan you've discovered is wrong.
6. If implementation forces a significant, durable architectural decision,
   write or update an ADR (`docs/decisions/`) in the same change.

## Stage 4 — Verification

Before calling the work complete:

1. Check the implementation against **every** requirement and acceptance
   criterion.
2. Run the relevant tests (`pnpm test`, `pnpm --filter silo exec tsc --noEmit`,
   `pnpm lint`).
3. Note any requirement left intentionally unmet, and why.
4. Confirm any durable decision is recorded as an ADR.

"All tasks checked" is not the bar. "The result satisfies the agreed
requirements" is.

## Stage 5 — Collapse

Delete the `requirements.md`, `design.md`, and `tasks.md` files. Rewrite the
directory back into a single `docs/proposals/NNNN-name.md` with
`status: implemented`. The numbered proposal file itself is never deleted — it
stays as the permanent record, exactly like every other proposal.

**Curate; don't concatenate.** The final proposal answers one question:

> What did we build, why, and what should a future developer or agent know?

It generally contains: title; `status: implemented`; problem; motivation; the
final solution; the requirements that still matter; the design/architecture
information worth keeping; important decisions; implementation references
(repo / package / extension); related ADRs. It does **not** preserve every task
or intermediate design thought — the code and tests are the truth of _how it
works now_.

```md
---
status: implemented
created: 2026-08-30
---

# 0099. Notes extension

## Summary

A `silo.notes` extension for jotting scratch notes alongside agent sessions.
Implemented in `silo-code/silo-extensions` (`notes/`).

## Motivation

...

## Final design

Notes are owned by the extension and persisted via `ctx.storage` (workspace
scope). The panel is a contributed Navigator view ...

## Requirements that still matter

- Notes persist across restarts and across workspace switches.
- A note's identifier is stable for its lifetime.

## Related decisions

- ADR 0004 — public `@silo-code/sdk` is types-first
- ADR 0022 — on-disk storage layout
```

## Multi-phase changes

Some proposals define more than one phase up front — a build sequenced into
shippable slices, each usable before the next begins, typically written as a
phase table under **Proposed solution**. The five stages above still apply,
but Stages 2–5 repeat **once per phase** instead of once for the whole
proposal:

```
docs/proposals/NNNN-name.md          status: accepted, phase table in Proposed solution
  │   phase 1 accepted for implementation
  ▼
docs/proposals/NNNN-name/            Stage 2 (phase 1) — scoped to phase 1 only
  │   implement ──► verify (phase 1)
  ▼
docs/proposals/NNNN-name.md          Stage 5 (phase 1) — collapse
    status: accepted                    (stays accepted; phases remain)
  │   phase 2 accepted for implementation
  ▼
docs/proposals/NNNN-name/            Stage 2 (phase 2) — scoped to phase 2 only
  │   ...repeat per phase...
  ▼
docs/proposals/NNNN-name.md          Stage 5 (final phase) — collapse
    status: implemented                 (every planned phase has shipped)
```

Rules:

- **Say the scope out loud.** The expanded `proposal.md` names which phase the
  package covers — a short note is enough — so a reader mid-package isn't left
  guessing whether `requirements.md` describes the whole proposal or one slice
  of it.
- **`status` tracks the whole proposal, not the phase just shipped.** A
  proposal collapsed after phase 1 stays `accepted`; it only becomes
  `implemented` once every phase the proposal commits to has shipped and
  collapsed.
- **The phase table survives every collapse.** Curate it like everything else
  in Stage 5: mark what shipped, keep what's still planned, so the next
  phase's package starts from an accurate picture instead of re-deriving one
  from the diff or git history.
- **A dropped or reshaped phase says so, in the collapsed proposal.** Update
  the phase table and explain why rather than leaving a stale commitment a
  future reader would otherwise trust.
- **Re-expansion is Stage 2 again.** A fresh `requirements.md` / `design.md` /
  `tasks.md`, scoped to the next phase and informed by whatever the prior
  collapse curated — not a continuation of the files deleted last time.

This needs no new proposal number and no new ADR — it is the same proposal,
still governed by [ADR 0045](./decisions/0045-ephemeral-change-planning.md);
only the planning package's scope and how many times Stage 5 runs differ from
a single-pass change.

### Starting the next phase

The transition from one phase to the next is an explicit two-step handoff. Do
not leave phase 1's planning files in place and edit them in place: those files
are the temporary record of the phase that just shipped.

After phase N has passed verification:

1. **Collapse phase N.** Curate the durable proposal, mark phase N as
   implemented in the phase table, keep the proposal `status: accepted` when
   another committed phase remains, delete the temporary
   `requirements.md`, `design.md`, and `tasks.md`, and repoint the proposal
   index row to `NNNN-name.md`.
2. **Re-expand for phase N+1 when work is ready.** Read the collapsed proposal
   and the actual phase-N implementation first. Confirm the next phase is still
   the next unimplemented row in the phase table. Create a fresh planning
   package, repoint the index row to `NNNN-name/proposal.md`, and write all
   three working artifacts specifically for phase N+1. Copy forward only
   constraints and decisions that still apply; do not recreate phase-N
   requirements or tasks.

The new package's `proposal.md` must contain a `Planning scope` section naming
the phase number and its exact scope, and must describe the prior phase as the
baseline. Its requirements, design, and tasks must not include work from later
phases. If the next phase's scope or sequencing no longer matches the table,
update the durable proposal first and explain the change; do not silently
reinterpret the phase while planning it.

Use this prompt to start a later phase:

```text
Start planning phase 2 of proposal 0031.

Phase 1 has already been implemented, verified, and collapsed. Treat the
collapsed proposal as the durable record of the product and phase 1 as the
current implementation baseline. Do not redo phase 1 planning.

Before writing anything, inspect:
- docs/proposals/0031-tasks-extension.md
- the actual phase 1 implementation and tests in silo-extensions
- the current Silo extension architecture, relevant ADRs, and docs

Confirm that phase 2 is the next unimplemented phase in the proposal's phase
table. If the table is stale or phase 1 was not actually collapsed and
verified, stop and report that instead of planning phase 2.

Re-expand the proposal into a fresh temporary planning package:
- docs/proposals/0031-tasks-extension/proposal.md
- requirements.md
- design.md
- tasks.md

Scope every artifact to phase 2 only: Beads and dex integration, detection and
per-workspace enablement, "new tasks go to", the Navigator view, the Tasks app
sheet, provider-rendered detail sections, and file-watched refresh. Treat phase
1's shipped behavior and architectural seams as the baseline. Identify any
phase-1 corrections or constraints that phase 2 must preserve.

Do not implement anything yet. Keep the proposal status accepted, update the
proposal index for the expanded package, and produce the planning artifacts
for review.
```

## The role of ADRs / decisions

A proposal describes a change and then records its outcome. An **ADR**
(`docs/decisions/`) records a durable architectural choice that stays relevant
long after the change ships — "we chose `ctx.storage` over a bespoke file,
because …". If the work produced such a choice, it belongs in an ADR, and the
collapsed proposal links to it rather than restating it. See
[`decisions/README.md`](./decisions/README.md) for the ADR-vs-proposal test.

## Cross-repository work

The proposal and its planning package live with the **product whose behavior
and architecture change** — this repo — even when the implementation lands
elsewhere. For a Silo extension built in `silo-code/silo-extensions`, the
proposal stays here and names the implementation repo and package explicitly
(e.g. "implemented in `silo-code/silo-extensions`, `tasks/`"). This keeps every
repo in the ecosystem from growing its own disconnected planning history.

## Relationship to the roadmap

Unchanged: a new public primitive still starts as a `planned` entry on
[`apps/docs/roadmap.md`](../apps/docs/roadmap.md) with its sketched surface, and
flips to `stable` when it ships. The planning package is where the design work
behind that flip happens; `design.md` and the roadmap sketch should agree.

## Principles

1. **Planning is ephemeral.** Requirements, design, and tasks are working
   artifacts — they don't stay in the repo forever.
2. **Decisions are durable.** Architectural reasoning goes in ADRs.
3. **Implemented proposals are durable.** The collapsed proposal captures
   intent, outcome, and context.
4. **Code is the source of truth for implementation.** The proposal doesn't
   duplicate it — read the proposal and ADRs for intent, then read the code and
   tests for current behavior.
5. **Framework-neutral.** Ordinary Markdown, directories, and the conventions
   this repo already has. Nothing here names a tool or methodology.
6. **A phased change collapses per phase, not per proposal.** `status` reflects
   the whole proposal — it stays `accepted` until every planned phase has
   shipped, not the moment any one phase does.
