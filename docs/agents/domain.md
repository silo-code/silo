# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** — ubiquitous language / glossary. Prefer these terms over
  inventing synonyms.
- **`docs/decisions/`** — ADRs, the durable "why" behind architecture decisions already made. Read any that touch the area you're about to work in.
- **`docs/proposals/`** — RFCs, forward-looking designs not yet decided. Check for open proposals relevant to the area.

This repo is a pnpm workspace (`apps/*`, `packages/*`, `examples/extensions/*`), but `docs/decisions/` and `docs/proposals/` are repo-wide, not per-package — there is no `src/<context>/docs/adr/` split to check.

## Use the glossary's vocabulary

Prefer terminology in `CONTEXT.md` (and, where it doesn't yet cover a concept,
`docs/decisions/`, `docs/proposals/`, and `docs/ui-terminology.md`) over inventing
new terms. When you introduce a new domain term, add it to `CONTEXT.md` in the
same change.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
