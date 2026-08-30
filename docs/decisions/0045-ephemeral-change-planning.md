---
status: accepted
date: 2026-08-30
---

# 0045. Substantial changes are planned in an ephemeral proposal expansion

## Context

Silo's contributors drive this repo with coding agents, and substantial work
(a new extension, a `ctx` domain, a persistence change) benefits from writing
down requirements, a design, and a task breakdown before and during
implementation. The repo already has `docs/proposals/` (RFCs) for
forward-looking design and `docs/decisions/` (ADRs) for settled architectural
reasoning, but no convention for the working artifacts _between_ an accepted
proposal and a shipped change — so agents either skip that planning or invent
ad-hoc structures per task.

The spec-driven-development frameworks that formalize this (Spec Kit, OpenSpec,
Kiro, and similar) bring a CLI, dependencies, metadata files, and
framework-specific directories. That trades away the property that this repo is
readable as an ordinary codebase, and couples the planning history to one tool.

At the same time, planning notes stop being useful once the code exists: the
code and its tests are the truth of _what the system does_, and the durable
_why_ belongs in an ADR. Keeping full requirements/design/task documents in the
tree forever means every reader wades through stale intermediate thinking.

## Decision

A substantial change is planned by **temporarily expanding its proposal**. An
`accepted` `docs/proposals/NNNN-name.md`, when implementation starts, becomes a
directory `docs/proposals/NNNN-name/` holding `proposal.md`, `requirements.md`,
`design.md`, and `tasks.md`. On completion the three planning files are deleted
and the directory collapses back to a single curated `NNNN-name.md` with
`status: implemented`. The numbered proposal file is never deleted; the
`requirements.md` / `design.md` / `tasks.md` are ephemeral by design.

The convention is ordinary Markdown and directories only — no CLI, dependency,
metadata system, or framework-specific naming. It is documented in
`docs/change-planning-convention.md`, with skeletons in
`docs/proposals/planning-template/`, and summarized in `AGENTS.md`. Existing
proposals are not migrated. Small, low-risk changes get no proposal at all.

## Consequences

- One planning workflow for humans and every coding agent, expressed in files
  the repo already understands — a fresh clone reveals nothing about which
  tool or methodology produced it.
- The durable surface stays small: one curated proposal per change plus any
  ADR, both linking to code rather than restating it.
- Curating the collapsed proposal is manual work at the end of a change, and
  the `requirements.md`/`design.md`/`tasks.md` are lost once deleted (they
  remain in git history). This is intentional — the collapsed proposal and the
  ADRs are meant to carry everything worth keeping.
- The proposal can live in this repo while the implementation lands in another
  (e.g. `silo-code/silo-extensions`); the proposal names the implementation
  repo and package.
- No enforcement. Whether a change is "substantial enough" is a judgment call,
  and an over-eager planning package for a trivial change is its own kind of
  noise.

## Alternatives considered

- **Adopt a spec-driven-development framework** (Spec Kit / OpenSpec / Kiro /
  similar) — rejected: adds a CLI, dependencies, and framework-specific
  directories, couples planning history to one tool, and makes the repo stop
  reading as an ordinary codebase.
- **Keep `requirements.md` / `design.md` / `tasks.md` in the tree permanently**
  — rejected: they go stale the moment the code diverges, and every future
  reader pays to skim intermediate thinking that the code, tests, and ADRs
  already supersede.
- **Do nothing beyond the existing RFC template** — rejected: leaves agents
  without a shared structure for the planning phase of substantial work, which
  is exactly where ambiguity and scope drift are most expensive.

## References

- `docs/change-planning-convention.md` — the full workflow and rationale.
- `docs/proposals/planning-template/` — the four-file skeleton.
- `docs/proposals/README.md`, `AGENTS.md` — updated to describe the expansion.
- ADR [0039](./0039-self-contained-agent-docs.md),
  [0040](./0040-skills-canonical-location-symlink.md) — prior process decisions
  keeping contributor tooling tool-agnostic and framework-neutral.
