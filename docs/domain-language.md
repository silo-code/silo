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

### Panels & Docking

**Shell**:
The top-level layout container orchestrating the overall grid — left column,
center, right column, status bar.
_Avoid_: App shell (ambiguous with Electron/PWA "shell"), root, chrome (too broad)

**Titlebar**:
The interactive region at the very top used for window dragging and window
controls.
_Avoid_: Header, top bar

**StatusBar**:
The horizontal bar at the very bottom for global status items and quick
toggles.
_Avoid_: Footer, bottom bar

**Busy status**:
Ephemeral, multi-source phrases in the StatusBar that describe **in-flight**
work (e.g. restoring terminals, removing a worktree). The host owns one
aggregated slot: a single summary line, and when more than one source is active
a trailing numbered badge with the count — click opens a host popover listing
every active entry. Errors and “needs attention” outcomes use notifications
(`ctx.ui.notify`), not sticky busy status.
_Avoid_: Context (overloaded — ExtensionContext, context keys, focus context),
progress alone (see `ctx.ui.progress` / RFC 0001 — task-scoped, not this slot),
toast for in-flight work (toasts are for outcomes / errors, not ambient busy)

**SideDock**:
One of the two collapsible vertical containers (left/right) on either side of
the center area. Hosts the Navigator and other Side Panels.
_Avoid_: Sidebar (OS/VS Code sense — see Navigator), side column

**Slot**:
A specific region within a SideDock. A SideDock splits into a Top Slot and a
Bottom Slot.
_Avoid_: Region, zone

**CenterDock**:
The primary, high-focus area in the middle of the app. Workspace-aware —
usually hosts the active workspace's own Dock.
_Avoid_: Main area, editor area (VS Code sense — too narrow, it hosts terminals too)

**Dock**:
A container that manages flexible layout and tab grouping for one workspace
(`WorkspaceDock`, built on the `dockview` library).
_Avoid_: Panel group (see Group, a narrower thing inside a Dock)

**Group**:
A collection of Panels sharing a single tab bar within a Dock. Groups can be
split horizontally or vertically.
_Avoid_: Tab group, pane

**Panel**:
The fundamental unit of UI content — a Terminal, File Explorer, or Editor. A
Side Panel lives in a SideDock; a Content (or File) Panel lives in the
CenterDock.
_Avoid_: View (a Navigator-only concept — see Navigator's View), tab (the
handle that points to a Panel, not the Panel itself — see Tab)

**Tab**:
The UI handle used to switch between Panels within a Group.
_Avoid_: Panel (the content it points to, not the handle itself)

**Active Panel**:
The one Panel currently active within a Dock — a _different_ "active" than
Navigator's Active View: dock-scoped, dockview-driven, and (per ADR 0032)
owned by exactly one authority, the workspace's own Dock. Nothing outside it
may activate a panel directly on a workspace switch — see Activation Request.
_Avoid_: Active view (the Navigator sense), focused panel (see Focus vs
Activation — the two aren't the same thing)

**Live Dock**:
The Dock that has actually mounted and committed as a workspace's current
dockview instance — distinct from which workspace the app's store says is
active, since a caller can flip that store state synchronously before the
dock it names has actually committed (ADR 0034). A cross-workspace caller
must check which dock is live, not which workspace the store says is active.
_Avoid_: Active dock (ambiguous with Active Panel), current dock

**Activation Request**:
A recorded intent for which Panel should become active in a workspace,
read by that workspace's own Dock the moment it goes live. The sanctioned way
for a caller outside a Dock — a cross-workspace jump, e.g. — to ask for a
specific Panel (ADR 0032).
_Avoid_: Pending activation, activation intent

**Focus vs Activation**:
Two distinct things dockview conflates: keyboard/DOM focus landing inside a
Panel automatically activates its Group. An unguarded focus grab is therefore
never "just" focus — it can silently change the visible Active Panel. Only
the Active Panel may take focus (ADR 0034).
_Avoid_: Treating "focused" and "active" as interchangeable

**Split**:
Dividing a Slot or Group into two or more sections.
_Avoid_: Divide, subdivide

**Collapsed / Expanded**:
The visibility state of a SideDock.
_Avoid_: Hidden/shown, open/closed (prefer collapsed/expanded to match the UI's own labels)

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

### Agents

**Agent** (of a terminal):
Not a separate entity — a _classification of a terminal's activity_, computed
live by the host and exposed as `AgentInfo` (keyed by `terminalId`). There is
no persisted `Agent` object with identity across time; `sessionId` (present
only once an opt-in hook reports it) is the closest thing to one.
_Avoid_: Agent session (no such persisted type exists — see Session Id),
Agent object

**Terminal Kind** vs **Catalog Agent** — two distinct "which agent" vocabularies
that share one string (`"claude"`) but otherwise don't line up:

- **Terminal Kind** (`TerminalKind`: `"shell" | "claude" | "pi"`): a
  **launch-time** choice — how the terminal was created. Only two agent
  values exist; `"pi"` is Dave's own local-model CLI and has no Catalog Agent
  counterpart (see gap note below).
- **Catalog Agent** (`AgentDefinition.id` in `AGENT_CATALOG`: `"claude" |
"codex" | "cursor" | "copilot" | "grok"`): a **detected-identity**
  classification, computed live from OSC/output signals against the sealed
  catalog. A Codex/Cursor/Copilot/Grok terminal is always launched at Terminal
  Kind `"shell"` and only later upgraded to `isAgent: true` once detected —
  there is no dedicated Terminal Kind for those four.
  _Avoid_: "agent type" or "agent kind" alone (ambiguous between the two);
  conflating a terminal's Kind with its detected Catalog Agent identity

> **Known gap**: `"pi"` terminals are marked `isAgent: true` by Terminal Kind
> alone. Since `AGENT_CATALOG` has no `"pi"` entry, they get no activity
> detection, no resume strategy, and no `agentId`/`agentName` — those three
> fields are populated only via catalog detection. Flagged as a gap worth
> tracking, not yet resolved.

**Sealed** (detection):
There is no public `registerAgent` / detector-registration API — `AGENT_CATALOG`
is host-internal, and every agent Silo recognizes is one entry in it (ADR 0028).
_Avoid_: Pluggable, extensible detection (explicitly rejected)

**Activity** (`AgentActivity`):
What an agent is currently doing, classified from OSC/output signals: `"none"`
(no agent activity observed) | `"working"` | `"idle"` (finished its last turn,
waiting for input) | `"error"` | `"dead"` (backend confirmed gone after an
unclean shutdown; nothing self-resolves this). Purely a fact about the agent —
independent of whether anyone is looking.
_Avoid_: Status (too vague), waiting/done (an earlier design conflated viewer
state into this field itself; see Needs Attention)

**Needs Attention**:
The separate, viewer-dependent "finished, go look" flag: set only if the
terminal wasn't the active one the instant the agent went idle, cleared only
by acknowledging. Watching a terminal live when its agent goes idle never sets
it — already seen needs no acknowledgment.
_Avoid_: Unread, pending (prefer "needs attention" to match the field name)

**Stale**:
A soft, self-clearing signal: a restored `working`/`needsAttention` duration
followed a gap long enough it can't be fully trusted. The next live signal
clears it automatically. Distinct from `activity === "dead"`, which is hard
and terminal (nothing clears it but a fresh session on the same terminal id).
_Avoid_: Dead, expired, disconnected (all imply the hard, non-self-clearing case)

**Resume** (exact resume):
Reproducing the precise command to reattach to a specific agent session
(`resumeCommand`), as opposed to a generic "an agent was running here" note.
Requires a resolved Session Id. Each Catalog Agent declares one `AgentResume`
strategy: `hook` (an installable SessionStart-style hook Silo can wire up),
`session-file` (reads the agent's own live session registry — currently only
Grok), or `none` (no exact-resume path; the terminal only ever gets the
honest, id-less generic hint).
_Avoid_: Reconnect, restore (prefer "resume" to match the CLI verb every
catalog agent itself uses)

**Session Id**:
The exact identifier for the agent running in a terminal. Present only once an
opt-in hook (or, for Grok, its native session file) reports it — Silo never
infers one by directory/recency, since that can silently resolve to the wrong
session.
_Avoid_: Terminal id (a different, always-present identifier), Agent id
(prefer Catalog Agent id, e.g. `"claude"`, for the stable catalog key)

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
