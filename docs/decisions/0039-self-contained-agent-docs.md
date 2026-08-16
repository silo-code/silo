---
status: accepted
date: 2026-08-15
---

# 0039. Self-contained agent docs — no hard dependency on externally-installed skills

## Context

`docs/agents/` existed as a translation layer for externally-installed
personal skill packages (`mattpocock/skills`): `docs/agents/domain.md` mapped
this repo's actual `docs/decisions/`/`docs/proposals/` split onto the
`domain-modeling` skill's hardcoded `CONTEXT.md`/`docs/adr/` conventions;
`docs/agents/triage-labels.md` translated that skill package's canonical
triage-role vocabulary into this repo's actual label strings;
`docs/agents/issue-tracker.md` carried "when a skill says X" stubs and a
`/wayfinder`-specific "Wayfinding operations" section.

A contributor working on Silo without those particular personal skills
installed hit dead references — a folder named for "agents" holding docs
that assume tooling they don't have — and no working glossary at all:
`CONTEXT.md`, the file those skills actually read from, didn't exist in the
repo. It only existed as a per-session artifact one of them might create on
demand, disconnected from the ADR/RFC-aware glossary contributors actually
want.

## Decision

Agent-facing process docs live as ordinary repo docs under `docs/` — no
dedicated `docs/agents/` folder, and no doc written assuming a specific
externally-installed skill package. The domain glossary is
`docs/domain-language.md` (merged with the former `docs/ui-terminology.md`),
always present and versioned with the code it describes. Where the repo
genuinely depends on a skill's _behavior_, not just its vocabulary, the
skill is forked into the repo and adapted to this repo's actual
conventions — starting with `silo-domain-modeling` (forked from the personal
`domain-modeling` skill), which now reads/writes
`docs/domain-language.md` and this repo's real `docs/decisions/`/
`docs/proposals/` split and format natively, with no translation layer
needed.

## Consequences

- Any contributor who opens this repo in Claude Code gets the
  domain-modeling workflow automatically, with no personal skill
  installation required.
- `docs/domain-language.md` is now the single glossary source — no drift
  risk between it and a second `docs/ui-terminology.md`.
- The externally-installed skills this repo doesn't fork
  (`improve-codebase-architecture`, `grill-with-docs`) still assume the
  generic `CONTEXT.md`/`docs/adr/` conventions; root `CLAUDE.md` keeps a
  short translation note for those two rather than forking skills that
  aren't yet load-bearing enough to justify it.
- Forking `domain-modeling` means it no longer tracks upstream improvements
  to the personal `mattpocock/skills` version automatically — an accepted
  cost of hardening it to this repo's actual doc layout.

## Alternatives considered

- **Keep relying on externally-installed skills, maintain `docs/agents/` as
  a translation layer** — rejected: the translation layer itself needs
  maintaining (see Context), and a contributor without the personal skill
  package installed gets nothing at all, not even a degraded experience.
- **Fork every skill this repo references, not just `domain-modeling`** —
  deferred, not rejected: `improve-codebase-architecture` and
  `grill-with-docs` aren't yet load-bearing for any repo-wide workflow the
  way `domain-modeling` is (glossary/ADR/RFC upkeep is expected of every
  contributor; the other two are occasional, personal-workflow tools). Fork
  them the same way if that changes.

## References

- Superseded: the former `docs/agents/domain.md`, `docs/agents/triage-labels.md`,
  `docs/agents/issue-tracker.md` (relocated to `docs/`, skill-specific glue
  removed), `docs/ui-terminology.md` (merged into `docs/domain-language.md`).
- `.agents/skills/silo-domain-modeling/SKILL.md` — the forked skill, named
  distinctly from its `domain-modeling` source to avoid shadowing it in other
  repos. (Its canonical location and the `.claude/skills/` symlink are ADR
  [0040](./0040-skills-canonical-location-symlink.md)'s concern, not this
  ADR's.)
- `docs/domain-language.md` — the merged glossary.
