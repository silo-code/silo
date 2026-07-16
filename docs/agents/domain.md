# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`docs/decisions/`** — ADRs, the durable "why" behind architecture decisions already made. Read any that touch the area you're about to work in.
- **`docs/proposals/`** — RFCs, forward-looking designs not yet decided. Check for open proposals relevant to the area.
- There is no repo-wide `CONTEXT.md` glossary yet. If one is created later (by `/domain-modeling`), read it before exploring.

This repo is a pnpm workspace (`apps/*`, `packages/*`, `examples/extensions/*`), but `docs/decisions/` and `docs/proposals/` are repo-wide, not per-package — there is no `src/<context>/docs/adr/` split to check.

## Use the glossary's vocabulary

No `CONTEXT.md` exists yet, so there's no fixed glossary to defer to. Prefer terminology already used in `docs/decisions/`, `docs/proposals/`, and `docs/ui-terminology.md` over inventing new terms.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
