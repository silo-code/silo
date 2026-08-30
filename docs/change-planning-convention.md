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

Numbering is the same sequence as every other proposal — sequential,
permanent, never reused (`NNNN-kebab-title`). A planning package keeps the
proposal's number; only its _shape_ changes.

Every stage that changes a proposal's shape or status also updates its row in
[`proposals/README.md`](./proposals/README.md) — creating it (stage 1),
repointing the link at `NNNN-name/proposal.md` and flipping `status` (stage 2),
and pointing it back at `NNNN-name.md` with `status: implemented` (stage 5). A
unit test enforces this; see that README's conventions.

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

# 0031. Tasks extension

## Summary

A `silo.tasks` extension for tracking implementation work alongside agent
sessions. Implemented in `silo-code/silo-extensions` (`tasks/`).

## Motivation

...

## Final design

Tasks are owned by the extension and persisted via `ctx.storage` (workspace
scope). The panel is a contributed Navigator view ...

## Requirements that still matter

- Tasks persist across restarts and across workspace switches.
- A task's identifier is stable for its lifetime.

## Related decisions

- ADR 0004 — public `@silo-code/sdk` is types-first
- ADR 0022 — on-disk storage layout
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
