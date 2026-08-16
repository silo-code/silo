---
status: accepted
date: 2026-08-16
---

# 0040. Skills live in `.agents/skills/`, `.claude/skills/` symlinks to them

## Context

Silo's own contributors drive this repo with several different coding
agents, not just Claude Code. ADR 0039 forked `silo-domain-modeling` (and
this repo already carried `silo-testing`, `silo-docs-sync`, `verifier-gui`,
`docs-screenshot`) into `.claude/skills/<name>/SKILL.md` — the location
Claude Code discovers natively. That format itself is not Claude
Code-specific: it follows the open **Agent Skills** spec
(`agentskills.io`), the same `SKILL.md`-plus-frontmatter convention
several other coding agents have adopted.

Testing confirmed OpenAI Codex CLI does not discover skills at
`.claude/skills/` — it scans `.agents/skills/` instead (walking from cwd up
to the repo root), the canonical, tool-agnostic location the Agent Skills
spec itself uses (mirroring how `AGENTS.md` is the tool-agnostic instruction
file Claude Code imports via `@AGENTS.md`, per ADR/CLAUDE.md's own split).
Unlike a single instructions file, a skill is a directory that can bundle
scripts and reference material, so there's no `@`-import equivalent —
making both locations work means either duplicating files or symlinking.

Two real-world precedents were found for repos supporting both Claude Code
and Codex: `clidey/whodb` keeps canonical content in `.agents/skills/` and
symlinks `.claude/skills/<name>` to it (`git` tracks the symlink itself,
mode `120000`) — zero duplication, both tools read the identical file.
`adobe/S3Mock` instead hand-duplicated the same content into
`.claude/commands/` (Claude Code's older, simpler slash-command mechanism,
not full Skills) — a second copy that has to be kept in sync by hand, with
nothing enforcing that it is.

## Decision

Each skill's real content lives in `.agents/skills/<name>/`. Each
`.claude/skills/<name>` is a relative symlink to it
(`../../.agents/skills/<name>`), matching `clidey/whodb`'s pattern. No file
is duplicated; both tools resolve to the same bytes.

## Consequences

- Codex now discovers Silo's project skills (it didn't before this
  change); Claude Code continues to discover them exactly as before — the
  symlink is transparent to it.
- Editing a skill means editing the file under `.agents/skills/`; editing
  through the `.claude/skills/` path also works (it's the same inode via
  the symlink) but `.agents/skills/` is the canonical path referenced from
  docs going forward.
- Windows contributors: `git` on Windows requires `core.symlinks=true` (and
  Developer Mode or an elevated clone) to materialize these as real
  symlinks rather than plain text files containing the target path. Not
  addressed here — revisit if a Windows contributor hits it.
- If a future tool needs a third location, the same symlink pattern
  extends without duplicating content again.

## Alternatives considered

- **Hand-duplicate into each tool's own directory** (the `adobe/S3Mock`
  pattern) — rejected: two copies drift out of sync with nothing to catch
  it, and scales linearly with every additional tool.
- **Keep skills Claude Code-only, accept Codex can't use them** — rejected:
  Codex is one of the coding agents Silo's own contributors actually use on
  this repo; the workflows the skills encode (testing conventions, docs
  sync, domain modeling) apply regardless of which agent is driving.
- **Make `.agents/skills/` the symlink target and `.claude/skills/` the
  real files** (the reverse direction) — rejected: `.agents/skills/` is the
  Agent Skills spec's own canonical, tool-agnostic name, and is what
  the largest number of adopting tools scan by default; anchoring
  canonical content there needs no special-casing if more tools adopt the
  spec later.

## References

- ADR [0039](./0039-self-contained-agent-docs.md) — forked
  `silo-domain-modeling` into `.claude/skills/` in the first place; this
  ADR relocates it (and the repo's other skills) without changing what they
  do.
- `.agents/skills/silo-testing/SKILL.md`, `.agents/skills/silo-docs-sync/SKILL.md`,
  `.agents/skills/silo-domain-modeling/SKILL.md`, `.agents/skills/verifier-gui/SKILL.md`,
  `.agents/skills/docs-screenshot/SKILL.md` — the relocated skills.
- `AGENTS.md`, `CLAUDE.md` — updated to reference `.agents/skills/` as
  canonical; `CLAUDE.md`'s `## Claude Code` section notes the symlink.
- External precedent: `clidey/whodb` (`.agents/skills/impeccable/` +
  `.claude/skills/impeccable` symlink), `adobe/S3Mock` (the rejected
  hand-duplication pattern).
