# Silo

All your projects, alive at once — for developers juggling coding agents.
Workspaces keep terminals, agents, and layout intact; switch instantly.
100% open source. Extensible via a public SDK.

## Language

### Worktrees

**Worktree**:
A git working tree of a repository — the main checkout or a linked one on
another branch — that Silo can open as a workspace folder.
_Avoid_: Clone (a separate repo copy), branch (the ref, not the directory)

**Main worktree**:
The primary working tree of the repository (git's main checkout). It cannot be
removed from Silo.
_Avoid_: Root worktree, primary worktree (prefer "main" to match git)

**Linked worktree**:
A non-main worktree of the same repository, typically on another branch.
_Avoid_: Secondary worktree, extra worktree

**Open alongside**:
Add a worktree's path as another folder in the current workspace so Files, Git,
and terminals see it next to existing folders — without switching workspaces.
_Avoid_: Open, attach, mount

**Close view**:
Remove a worktree's folder from the workspace only. The worktree and its branch
stay on disk.
_Avoid_: Close worktree (ambiguous with Remove), detach, unload

**Remove worktree**:
Delete a linked worktree's directory and git bookkeeping; the branch itself is
kept. Irreversible for uncommitted work when force-confirmed.
_Avoid_: Delete worktree, destroy worktree

**Prune stale**:
Clear git bookkeeping for worktrees whose directories are already gone.
_Avoid_: Clean, garbage-collect worktrees

**Pending remove**:
A Remove worktree that has passed every confirm and is still deleting on disk.
The workspace folder is already closed; the operation is not cancelable.
_Avoid_: Background delete, queued delete
