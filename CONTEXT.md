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

### Keybindings

**Keybinding**:
A single chord bound to a command. Each command has at most one effective
keybinding.
_Avoid_: Hotkey, accelerator (native-menu term only), shortcut (prefer for the
settings page name, not the binding itself)

**Keyboard Shortcuts**:
The Settings page where users browse and change keybindings.
_Avoid_: Keybindings page, keymap editor, hotkeys settings

**Chord**:
One simultaneous key combination (modifiers + key), e.g. Cmd+Shift+S. Not a
multi-press sequence.
_Avoid_: Sequence, key chord chain, chord progression

**Default keybinding**:
The chord an extension or menu declares for a command before any user change.
_Avoid_: Built-in shortcut, factory binding

**Override**:
A user-chosen chord for a command that replaces its default.
_Avoid_: Custom keybinding, remapping, user binding (prefer "override" when
contrasting with default)

**Unbound**:
A command the user has explicitly left with no chord, including clearing a
default.
_Avoid_: Disabled, removed command, cleared (prefer "unbound" / "remove
keybinding")

**Effective key**:
The chord that actually applies to a command right now — override if present,
otherwise default, unless unbound.
_Avoid_: Resolved key, active shortcut, current binding (ambiguous with
"selected row")

**Capture**:
The inline mode on a Keyboard Shortcuts row where the next chord pressed
becomes that command's override.
_Avoid_: Record, listen, key recording, rebind mode

**Reassign**:
Taking a chord from another command: the previous owner becomes unbound (or
loses that override) so only one command keeps the chord.
_Avoid_: Steal, conflict resolve, overwrite

**Reset keybinding**:
Drop the override so the command returns to its default (or to unbound if it
had no default).
_Avoid_: Restore, revert shortcut, clear override (prefer "reset" in the UI)

**Remove keybinding**:
Make a command unbound — no chord fires it, even if a default existed.
_Avoid_: Delete keybinding, clear shortcut, unbind (ok in prose; UI says Remove)
