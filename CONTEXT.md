# Silo

All your projects, alive at once — for developers juggling coding agents.
Workspaces keep terminals, agents, and layout intact; switch instantly.
100% open source. Extensible via a public SDK.

## Language

### Workspaces

**Workspace**:
The unit Silo switches between. Each keeps its terminals, editors, side-panel
layout, and session state alive while another is active.
_Avoid_: Project (too vague), session (the PTY/process sense), window

**Workspaces view**:
The default Navigator view — the list of open workspaces (with groups, badges,
and status rows). Contributed by `core.workspaces` like any other view.
_Avoid_: Workspaces panel (the old name for the Navigator itself)

### Navigator

**Navigator**:
The side panel you navigate the app from. A container of Views, owned by
`core.navigator`.
_Avoid_: Workspaces panel, sidebar (OS/VS Code sense), activity bar

**View**:
One projection inside the Navigator — another way to answer "where can I go",
rendered as the whole panel body. Distinct from a Side Panel: a new way to
navigate is a new View, not a second competing panel.
_Avoid_: Side Panel (when the intent is navigation), tab, mode (prefer View),
editor view (the CenterDock `viewType` sense)

**Active View**:
The one View currently rendered in the Navigator. A persisted, global user
choice — unrelated to the focus/activation sense "active" carries for
workspaces, docks, and panels.
_Avoid_: Open view, current view, selected view, visible view

**View List**:
The rows at the top of the Navigator, one per registered View — how you reach a
View, and what tells you which Views exist. Hidden when only one is registered.
_Avoid_: View selector, view menu, view switcher, view picker (none of these are
a dropdown any more), tab bar

**View Header**:
The bar between the View List and the panel body. Names the Active View and
hosts its toolbar actions.
_Avoid_: Navigator header (ambiguous with the View List above it), panel header,
title bar

**Open Workspace menu**:
The shared "saved workspaces / New workspace…" menu offered from the Navigator's
View Header, the workspace status-bar item, and the empty CenterDock.
_Avoid_: Add workspace menu, reopen picker (that's the closed-workspace path)

### Layout

**Laptop Mode**:
A second, independent layout mode used when the app window is narrow. Collapse
state and column widths for Laptop Mode are remembered separately from the
normal-width layout, per workspace.
_Avoid_: Small-screen mode (code name only), compact mode, responsive layout
(implies one layout that reflows)

**Peek**:
A transient overlay that reveals a collapsed side panel while the cursor sits
at that window edge. Available whenever a side is collapsed — not only in
Laptop Mode.
_Avoid_: Drawer, flyout, temporary expand

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

**Close worktree view**:
Remove a worktree's folder from the workspace only. The worktree and its branch
stay on disk. "View" here means the open-alongside folder — not a Navigator
View. Distinct from Remove worktree (which deletes the directory).
_Avoid_: Close view, Close worktree (ambiguous with Remove), detach, unload

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
