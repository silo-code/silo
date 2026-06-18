# Workspaces

A workspace is a named project rooted at a folder. Silo runs all your open
workspaces simultaneously — each keeps its terminals, editors, and layout alive
in the background. Switching is instant, with no reload.

## Opening a workspace

From the terminal, run `silo` with a path:

```sh
silo .                  # current directory
silo ~/code/my-project  # any folder
```

If a workspace already exists for that folder, Silo brings it to the foreground.
Otherwise it creates one and activates it.

From inside Silo, click the active workspace name in the status bar, then choose
**Open** to pick a folder or reopen a recently closed workspace.

## Switching between workspaces

**Status bar** — the active workspace name sits at the bottom-left of the
window. Click it to open a menu listing every open workspace; click any entry
to switch immediately.

**Keyboard** — press <kbd>⌘`</kbd> to cycle forward through open workspaces, or
<kbd>⌘~</kbd> to cycle backward. A small popup floats above the status bar while
the modifier is held — release to land on the highlighted workspace.

**Workspaces panel** — click the workspace icon in the left dock to open the
Workspaces panel. The panel lists every open workspace; click a row or press
Enter on the focused row to activate it.

## Closing and reopening

**Close** hides a workspace without losing its state. Closed workspaces appear
in the Workspaces panel's closed list and in the **Open** submenu of the status
bar menu. Reopen one to bring it back exactly as you left it — terminals,
editors, and all.

**Delete** removes a workspace permanently. Its terminals end and any unsaved
editors are closed.
