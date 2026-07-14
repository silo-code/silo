---
"@silo-code/sdk": minor
---

`ctx.processes` now reports which workspace each session belongs to and can
aggregate across every loaded workspace, not just the active one:

- New `ProcessInfo.workspaceId` field, kept in sync as a session's owning
  workspace changes (e.g. a terminal moves workspaces).
- `getState({ allWorkspaces: true })` returns live sessions from every loaded
  workspace instead of just the active one.
- `subscribe(listener, { allWorkspaces: true })` fires on changes anywhere,
  not just the active workspace.
