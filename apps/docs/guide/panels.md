# Layout & panels

A Silo window has three regions. The **center** holds tabs — chats, editors,
and terminals are all the same kind of tab, and you can split them any way you
like. The **left column** is the Navigator: your workspaces and your agents.
The **right column** holds the workspace tools: Files, Search, Git, Themes,
and anything an extension adds. The **status bar** runs along the bottom.

<img class="zoomable" src="/img/guide/layout-many.png" alt="A Silo window: the Navigator on the left, a Chat panel with an editor tab in the center, two terminals below it, and the Files and Git panels on the right" width="688" />

Every workspace has its own layout, and Silo remembers it — see
[Workspaces](/guide/workspaces).

## The center

The center is where you work. Three kinds of tab live there:

| Tab          | How to open                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------ |
| **Chat**     | **+** in the tab bar → an agent profile, or <kbd>⌘⌥I</kbd> for the default.                      |
| **Terminal** | **+** → **New Terminal**, or <kbd>⌘T</kbd>.                                                      |
| **Editor**   | Click a file in Files, **+** → **Open file…** (<kbd>⌘O</kbd>), or **New file…** (<kbd>⌘N</kbd>). |

An empty workspace shows these same actions in the middle of the window.

**Splits.** Drag a tab to the left, right, top, or bottom edge of the center
to split it. Each split is its own group with its own tab bar and **+**
button, so a chat on the left and the file it's editing on the right is one
drag away. Drag a tab onto another group's tab bar to move it there.

**Naming.** Right-click a tab → **Rename…** to give a terminal or a panel a
name that survives restarts. A terminal otherwise shows what's running in it;
a chat names itself after the conversation.

**Keyboard.**

| Action               | Mac            | Windows / Linux       |
| -------------------- | -------------- | --------------------- |
| Next tab             | <kbd>⌘⌥→</kbd> | <kbd>Ctrl+Alt+→</kbd> |
| Previous tab         | <kbd>⌘⌥←</kbd> | <kbd>Ctrl+Alt+←</kbd> |
| Next split group     | <kbd>⌘⌥↓</kbd> | <kbd>Ctrl+Alt+↓</kbd> |
| Previous split group | <kbd>⌘⌥↑</kbd> | <kbd>Ctrl+Alt+↑</kbd> |
| Close tab            | <kbd>⌘W</kbd>  | <kbd>Ctrl+W</kbd>     |

### Editors

Clicking a file opens it as a **preview** tab (italic title) that the next
click replaces; double-click, or start editing, to keep it. Markdown files
open as a rendered preview, images as an image viewer, and everything else in
a code editor with <kbd>⌘S</kbd> to save. Paths in a chat transcript or a
terminal are clickable and open the same way.

### Terminals

A terminal is a real login shell in the workspace folder (in a multi-folder
workspace, Silo asks which). It keeps running when you switch workspaces,
and it is restored — scrollback included — when you restart Silo. Running
`claude` or any other agent CLI here works too; see
[Terminal agents](/guide/agent-sessions) for what Silo tracks when you do.

## The Navigator (left column)

The Navigator has two views, selected by the rows at the top:

- **Workspaces** — every open workspace, grouped if you've made groups, with
  the chats and agents running inside each one listed under its row.
  [Workspaces](/guide/workspaces) covers it.
- **Agents** — every agent session across all workspaces, grouped by
  **Working**, **Ready** (waiting for you), and **Idle**, or by workspace.
  Click one to jump to it. Older idle sessions fold away under a cutoff you
  set in **Settings → Agents → Navigator**.

<img class="zoomable" src="/img/guide/agents-view.png" alt="The Navigator's Agents view listing sessions under Working, Ready, and Idle" width="400" />

Extensions can add views here as well.

## The right column

| Panel      | What it shows                                                  |
| ---------- | -------------------------------------------------------------- |
| **Files**  | The file tree for each folder in the workspace.                |
| **Search** | Content search across the workspace (<kbd>⌘⇧F</kbd>).          |
| **Git**    | Changes, staging, commit, branch switching, and git worktrees. |
| **Themes** | Live theme picker.                                             |

<img class="zoomable" src="/img/guide/panels-file-explorer.png" alt="The Files panel open in the right column, showing the project tree" width="400" />

Click a panel's tab to bring it forward. Drag a tab onto the other column to
move it there, or onto the column's edge to stack two panels one above the
other — Files on top, Git below is a common arrangement.

<img class="zoomable" src="/img/guide/panels-side-column.png" alt="The right column with the Files panel stacked above the Git panel" width="400" />

### Git worktrees

The Git panel's **⋯ → Manage worktrees…** lists every
[git worktree](https://git-scm.com/docs/git-worktree) of the repo — including
ones created outside Silo, say by an agent — wherever they live on disk. From
there you can:

- **Open a worktree alongside** the current folders. It appears as an extra
  root in Files and Git, with its own branch and its own commit box. **Close
  worktree view** removes just that root; the worktree on disk is untouched.
- **Create a worktree** on a new or existing branch. The suggested location
  is a sibling folder named `<repo>-<branch>`, which keeps it out of the main
  checkout's file watcher and git status.
- **Remove a worktree** — deletes its directory but keeps the branch. A
  worktree with uncommitted changes asks for a force-remove first. **Prune
  stale** clears bookkeeping for worktrees deleted by hand.

A Git view rooted in a linked worktree shows a **worktree** pill next to its
branch name; click it to open the manager.

## Showing and hiding columns

The two buttons at the far right of the status bar toggle the left and right
columns. From the keyboard:

| Action              | Mac            | Windows / Linux       |
| ------------------- | -------------- | --------------------- |
| Toggle left column  | <kbd>⌘⌥[</kbd> | <kbd>Ctrl+Alt+[</kbd> |
| Toggle right column | <kbd>⌘⌥]</kbd> | <kbd>Ctrl+Alt+]</kbd> |

On a narrow window Silo switches to a **small-screen mode** where the
columns overlay the center instead of squeezing it (**Settings →
Application**).

## Moving focus without the mouse

Focus cycles left column → center → right column:

| Action                | Mac            | Windows / Linux       |
| --------------------- | -------------- | --------------------- |
| Focus next region     | <kbd>⌘⌥.</kbd> | <kbd>Ctrl+Alt+.</kbd> |
| Focus previous region | <kbd>⌘⌥,</kbd> | <kbd>Ctrl+Alt+,</kbd> |

Collapsed columns are skipped. Inside a column, <kbd>Tab</kbd> moves between
controls. All of these are rebindable on **Settings → Keyboard Shortcuts**;
the defaults are collected on [Keyboard shortcuts](/guide/keyboard-shortcuts).

## The status bar

Left to right: the **active workspace** (click for the switcher menu), then
whatever extensions contribute, then the **theme**, **Settings**
(<kbd>⌘,</kbd>), and the two **column toggles**.

## See also

- [Chat with Claude Code](/guide/chat) — the Chat panel in depth
- [Workspaces](/guide/workspaces) — groups, switching, closing and reopening
- [Extensions](/guide/extensions) — install panels contributed by extensions
- [Keyboard navigation](/guide/keyboard-navigation) — for extension authors
  building keyboard-navigable panels
