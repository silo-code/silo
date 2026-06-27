# Side panels

Silo has two side columns — left and right — each hosting one or more panels.
Panels hold workspace-level tools: file browsing, search, git, themes, and
anything added by extensions. The center area is always the primary focus;
the columns are secondary, collapsible surfaces.

## Built-in panels

**Left column**

| Panel      | What it shows                                       |
| ---------- | --------------------------------------------------- |
| Workspaces | All open workspaces; click or press Enter to switch |

**Right column**

| Panel  | What it shows                                    |
| ------ | ------------------------------------------------ |
| Files  | File tree for the active workspace               |
| Search | Cross-file content search                        |
| Git    | Staged/unstaged changes, commit, branch switcher |
| Themes | Live theme preview and picker                    |

Extensions can add panels to either column — see [Extensions](/guide/extensions).

## Showing and hiding columns

**Status bar** — the two column-toggle buttons sit at the far left of the status
bar. Click the left one to show or hide the left column; click the right one for
the right column.

**Keyboard** — the View menu drives the same toggles:

| Action              | Mac            | Windows / Linux       |
| ------------------- | -------------- | --------------------- |
| Toggle left column  | <kbd>⌘⌥[</kbd> | <kbd>Ctrl+Alt+[</kbd> |
| Toggle right column | <kbd>⌘⌥]</kbd> | <kbd>Ctrl+Alt+]</kbd> |

You can also rebind these — see [Keyboard navigation](/guide/keyboard-navigation).

## Switching panels within a column

When a column has more than one panel, the panel icons appear along the column's
edge. Click an icon to bring that panel to the foreground. The column expands
automatically if it was collapsed.

## Moving focus between columns and the center

Keyboard focus follows a left → center → right cycle. To move between regions
without the mouse:

| Action                | Mac            | Windows / Linux       |
| --------------------- | -------------- | --------------------- |
| Focus next region     | <kbd>⌘⌥.</kbd> | <kbd>Ctrl+Alt+.</kbd> |
| Focus previous region | <kbd>⌘⌥,</kbd> | <kbd>Ctrl+Alt+,</kbd> |

Collapsed or empty columns are skipped. Once focus is inside a column, use
<kbd>Tab</kbd> to move between controls within the panel.

## Navigating tabs in the center dock

The center area can hold multiple tab groups, split horizontally or vertically.

| Action               | Mac            | Windows / Linux       |
| -------------------- | -------------- | --------------------- |
| Next tab             | <kbd>⌘⌥→</kbd> | <kbd>Ctrl+Alt+→</kbd> |
| Previous tab         | <kbd>⌘⌥←</kbd> | <kbd>Ctrl+Alt+←</kbd> |
| Next split group     | <kbd>⌘⌥↓</kbd> | <kbd>Ctrl+Alt+↓</kbd> |
| Previous split group | <kbd>⌘⌥↑</kbd> | <kbd>Ctrl+Alt+↑</kbd> |

## See also

- [Extensions](/guide/extensions) — install panels contributed by extensions
- [Workspaces](/guide/workspaces) — the Workspaces panel in detail
- [Keyboard navigation](/guide/keyboard-navigation) — building keyboard-navigable panels (extension authors)
