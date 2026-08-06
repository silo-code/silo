---
status: accepted
date: 2026-07-17
---

# 0025. Pending remove for worktrees — close folder on start, StatusBar until done

## Context

Removing a linked git worktree runs `git worktree remove`, which can take a long
time on a large tree. After the user confirms, Silo previously awaited the
command with almost no feedback (a modal `busy` flag that only disabled Create /
Prune). Users could not tell whether remove had started, and dismissing the
worktree manager gave no lasting signal.

A host `ctx.ui.progress` primitive is still planned ([RFC 0001](../proposals/0001-ctx-ui-slice-2.md))
but is not required for this first-party flow. The grilled product contract
(2026-07-17) pins Remove-worktree behavior without waiting on that RFC.

## Decision

**Remove worktree** (manager trash / row menu, and Git view ⋯ → Remove worktree…)
uses a **pending remove** after every confirm (including force-remove) completes:

1. Mark the worktree path as pending in an **extension-scoped** set that
   outlives the manager modal.
2. If that path is open as a workspace folder, **close the folder immediately**
   (condemned checkout — do not leave Files/Git rooted on a directory git is
   deleting).
3. Show per-row **Removing…** in the manager when it is open; other rows stay
   usable. Concurrent pending removes are allowed.
4. Show a single aggregated, **informational** StatusBar item until the set is
   empty (not clickable, not cancelable).
5. On success: clear pending; toast only if the manager was dismissed. On
   failure: clear pending, error toast, leave the folder closed; the user can
   Open alongside again from the manager.

Create and prune are out of scope for this pattern until a second consumer
justifies generalizing (or `ctx.ui.progress` lands).

## Consequences

- Users get honest progress whether they wait in the modal or dismiss it.
- Close-on-start can leave a worktree on disk with no open folder if remove
  fails — recovered via Open alongside, not auto-reopen.
- Aborting `git worktree remove` mid-flight is unsupported (half-deleted trees /
  prunable bookkeeping).
- Does **not** ship `ctx.ui.progress`; git-explorer owns the StatusItem. A later
  second consumer may motivate RFC 0001 instead of more one-off StatusItems.

## Alternatives considered

- **Wait for `ctx.ui.progress` (RFC 0001)** — deferred: this bug does not need a
  new public primitive.
- **Close folder only after disk remove succeeds** — rejected: long zombie open
  folder against a dying tree.
- **Auto-re-add the folder on failure** — rejected: surprising if the user has
  moved on.
- **Cancelable remove** — rejected: killing git mid-remove is unsafe without a
  dedicated cleanup path.
- **Block dismiss while removing** — rejected: contradicts wait-or-dismiss.

## References

- Glossary: `CONTEXT.md` (Remove worktree, Pending remove, Close worktree view).
- Related: [0018](./0018-host-owned-chrome.md) (host chrome; progress still planned).
- Deferred: [RFC 0001](../proposals/0001-ctx-ui-slice-2.md) (`ctx.ui.progress`).
