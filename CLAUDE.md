@AGENTS.md

## Claude Code

- The workflows referenced above under `.claude/skills/*/SKILL.md`
  (`silo-testing`, `silo-docs-sync`, `silo-domain-modeling`) are registered
  Claude Code skills — invoke them via the Skill tool rather than reading
  them manually; Claude Code also surfaces them proactively when a task
  matches their description.
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
