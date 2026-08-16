---
name: silo-domain-modeling
description: Build and sharpen Silo's domain glossary (docs/domain-language.md) as you design — challenge fuzzy terminology, discuss edge-case scenarios, and record decisions the moment they crystallize. Use when pinning down vocabulary, evaluating a naming choice, or when a change touches docs/decisions/ (ADRs) or docs/proposals/ (RFCs).
---

# Domain Modeling

Actively build and sharpen Silo's domain model as you design — not just read
it. Challenging terms, inventing edge-case scenarios, and writing the
glossary/decisions down the moment they crystallize is the active half of
this skill; merely reading the docs below for vocabulary is a one-line habit
any skill can do.

## Where things live

- **`docs/domain-language.md`** — the glossary. Ubiquitous language for the
  product: Workspaces, Navigator, Panels & Docking, Agents, Worktrees,
  Keybindings, and any other cluster of terms specific to Silo. Single file,
  single context — Silo doesn't split into bounded contexts, so there's no
  `CONTEXT-MAP.md`-style index to maintain.
- **`docs/decisions/`** (ADRs) — decisions already **made**. Read
  `docs/decisions/README.md` first for the ADR-vs-RFC test, numbering, and
  status vocabulary, and use `docs/decisions/template.md` for the format.
  Update the index table in `README.md` when adding one.
- **`docs/proposals/`** (RFCs) — forward-looking designs **not yet decided**.
  Read `docs/proposals/README.md` and use `docs/proposals/template.md`. Same
  index-update rule.

## During the session

### Challenge against the glossary

When a term conflicts with `docs/domain-language.md`, call it out
immediately. "The glossary defines 'cancellation' as X, but you seem to mean
Y — which is it?"

### Sharpen fuzzy language

Propose a precise canonical term for vague or overloaded language. "You're
saying 'active' — the Navigator's Active View, or a Dock's Active Panel?
Those are deliberately different things here."

### Discuss concrete scenarios

Stress-test domain relationships with specific, edge-case scenarios that
force precision about the boundaries between concepts.

### Cross-reference with code and existing docs

Check whether the code, and any existing ADR/RFC, agree with what's being
stated. Surface contradictions rather than silently accepting them:
"`terminal-service.ts`'s `focus()` checks the live dock (ADR 0034), but you
just described it checking `activeWorkspaceId` — which is current?"

### Update `docs/domain-language.md` inline

The moment a term is resolved, edit the glossary — don't batch it up. Use the
format below. `docs/domain-language.md` is a glossary, not a spec,
scratchpad, or implementation-decision log — no implementation details.

### Offer an ADR or RFC sparingly

Only when all three hold:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader would wonder why
3. **The result of a real trade-off** — genuine alternatives existed

If it's already **decided**, it's an ADR (`docs/decisions/`). If it still
needs design before deciding — cross-cutting, hard to reverse, or
contentious, per `docs/proposals/README.md`'s test — it's an RFC
(`docs/proposals/`). A small, obvious choice needs neither.

### Flag ADR/RFC conflicts

If your output contradicts an existing ADR or open RFC, surface it
explicitly rather than silently overriding: "Contradicts ADR 0032 (dock
active-panel authority) — but worth reopening because…"

## Glossary format

```md
**Term**:
One or two sentences. Define what it IS, not what it does.
_Avoid_: Synonym1, synonym2 (why they're wrong or ambiguous here)
```

Rules:

- **Be opinionated.** Pick the best term among synonyms; list the rest under
  `_Avoid_`.
- **Keep definitions tight.** One or two sentences max.
- **Only project-specific terms.** General programming concepts (timeouts,
  error types) don't belong even if Silo uses them extensively — ask "is
  this concept unique to Silo, or generic?" before adding it.
- **Group under `###` subheadings** when a natural cluster emerges (see the
  existing Workspaces / Navigator / Panels & Docking / Agents sections).
