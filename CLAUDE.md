@AGENTS.md

## Claude Code

- The workflows referenced above under `.agents/skills/*/SKILL.md`
  (`silo-testing`, `silo-docs-sync`, `silo-domain-modeling`) are registered
  Claude Code skills — invoke them via the Skill tool rather than reading
  them manually; Claude Code also surfaces them proactively when a task
  matches their description. Claude Code only discovers skills under
  `.claude/skills/`, not the canonical `.agents/skills/` (the Codex-native,
  `agentskills.io`-spec-aligned location) — each skill's real content lives
  in `.agents/skills/<name>/`, and `.claude/skills/<name>` is a symlink to
  it, so both tools read the same file with nothing to keep in sync.
- `silo-domain-modeling` is a repo-local fork of the personal
  `domain-modeling` skill, adapted to this repo's actual doc layout and
  format (`docs/domain-language.md`, `docs/decisions/`, `docs/proposals/`),
  rather than that skill's generic `CONTEXT.md`/`docs/adr/` defaults.
- **Other externally-installed skills**: `improve-codebase-architecture` and
  `grill-with-docs` (from `mattpocock/skills`) still hardcode `CONTEXT.md`
  and `docs/adr/` in their own instructions and have no concept of
  `docs/proposals/` (RFCs). When running them: treat `docs/adr/` as
  `docs/decisions/` (read/write there, continuing the existing numbering —
  never create a separate `docs/adr/` directory), and `CONTEXT.md` as
  `docs/domain-language.md`. Don't expect either skill to read or write
  `docs/proposals/`.
