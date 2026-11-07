# Workspaces

A **workspace** is a project you have open in Silo: one or more folders plus
everything you've arranged around them — chats, terminals, editors, panels,
and the layout they sit in. Silo keeps every open workspace running at the
same time. Switching is instant, nothing reloads, and an agent working in a
workspace you can't see keeps working.

If you only ever open one project, a workspace is just "the folder I'm
working in" and you never need to think about it. The rest of this page is
for when you have more than one.

<img class="zoomable" src="/img/guide/workspaces-groups.png" alt="The Navigator's Workspaces view with two colored groups, Acme and Personal, each holding a few workspaces" width="400" />

## Opening a workspace

Click **+** next to **Workspaces** in the Navigator, choose **New
workspace…** (<kbd>⌘⇧N</kbd>), and pick a folder. Silo creates a workspace
named after the folder and switches to it. If you already have a workspace for
that folder, Silo switches to that one instead of making a duplicate.

<img class="zoomable" src="/img/guide/workspaces-open.png" alt="The Navigator's Workspaces view with the + button" width="400" />

From the shell, once [the `silo` command](/guide/cli) is installed:

```sh
silo .                  # current directory
silo ~/code/my-project  # any folder
```

**More than one folder.** Pick several folders in the picker, or add one
later from **Workspace Properties…** (right-click the workspace). Silo treats
the workspace as multi-root: the Files panel shows each folder as its own
tree, the Git panel shows each repo separately, and a new terminal or chat
asks which folder to start in. This is how you work on a monorepo and a
sibling repo, or a project and its docs, as one unit.

## Your layout, remembered

Every workspace remembers its exact arrangement — which chats and editors
are open, how the center is split, which terminal is in which tab, which side
panels are showing — and restores it when you switch back or when you restart
Silo.

That persistence rewards giving tabs a job. One terminal for the dev server,
one for tests, one chat for the feature you're building, one for the bug you
keep coming back to. Switch away for a day; they're all still there.

<img class="zoomable" src="/img/guide/workspaces-terminal-tabs.png" alt="A terminal group with two named tabs, dev server and tests, the dev server logging requests" width="400" />

## Switching

- **Keyboard** — <kbd>⌘`</kbd> cycles forward through open workspaces,
<kbd>⌘⇧`</kbd> backward. A small switcher floats above the status bar while
  you hold the modifier; release to land.
- **Status bar** — the active workspace's name sits at the bottom-left. Click
  it for a menu of every open workspace.
- **Navigator** — click any row in the Workspaces view.

<img class="zoomable" src="/img/guide/workspaces-statusbar.png" alt="The status bar's workspace menu listing the open workspaces" width="400" />

Under each row the Navigator shows what's going on inside: the chats and
agents running there, with a dot that changes when one finishes or needs an
answer. You can see which project wants attention without switching to it.

## Groups

Once you have more than a handful of workspaces, put them in **groups**: a
client, a product, a team, "personal". Click **+** next to **Workspaces** and
choose **New Group…**, give it a name and optionally a color, then drag
workspaces in (or right-click a workspace → **Move to Group**).

Groups are purely for you — they don't change how workspaces behave. A few
things they do give you:

- **Collapse** a group to hide its workspaces from the list while they keep
  running.
- **Color** tints the group's rows so you can tell a client's projects apart
  at a glance.
- **Close Group** closes every workspace in it at once, and restoring the
  group brings back exactly the set that was open.
- Drag to reorder groups, or workspaces within a group. A group can sit
  anywhere in the list, above or below ungrouped workspaces.

## Properties

**Workspace Properties…** (right-click a row, or from the status-bar menu)
lets you rename a workspace, add or remove folders, and see any git worktrees
open alongside it. The name is yours — it doesn't have to match the folder.

## Closing, reopening, deleting

**Close** takes a workspace out of the list without losing anything. Its
terminals keep running in the background; its chats, editors, and layout are
kept. Closed workspaces
are listed under **Saved** in the **+** menu and in the status bar's **Open**
submenu — reopen one and it comes back as you left it, and a chat you were
having resumes. There is also a **Reopen Last Closed Workspace** command you
can bind a key to.

**Delete** removes a workspace permanently: its terminals end and unsaved
editors are closed. The folder on disk is never touched.

## See also

- [Working across many projects](/guide/many-projects) — the full setup for a
  dozen workspaces, groups, several agents, and background services.
- [Layout & panels](/guide/panels) — what's inside a workspace and how to
  arrange it.
- [The `silo` command](/guide/cli) — open and switch workspaces from a
  script or a shell.
