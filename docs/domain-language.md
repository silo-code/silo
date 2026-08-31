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
The one View currently rendered in the Navigator's **one-at-a-time**
arrangement. A persisted, global user choice — unrelated to the
focus/activation sense "active" carries for workspaces, docks, and panels. The
Stacked arrangement has no Active View.
_Avoid_: Open view, current view, selected view, visible view

**View List**:
The rows at the top of the Navigator in the **one-at-a-time** arrangement, one
per enabled View — how you reach a View, and what tells you which Views exist.
Hidden when only one View is enabled, and absent entirely in the Stacked
arrangement.
_Avoid_: View selector, view menu, view switcher, view picker (none of these are
a dropdown any more), tab bar

**View Header**:
The bar between the View List and the panel body. Names the Active View and
hosts its toolbar actions. In the Stacked arrangement there is one per section,
each carrying its own view's title, disclosure toggle, and actions.
_Avoid_: Navigator header (ambiguous with the View List above it), panel header,
title bar

**View arrangement**:
How the Navigator lays out its enabled Views — a persisted, global user choice
(Settings → Layout → Navigator). Either **one at a time** (the View List plus a
single Active View — the default) or **Stacked**.
_Avoid_: View mode, layout mode, Navigator mode

**Stacked view**:
The Navigator arrangement with no View List — every enabled View is a
collapsible section, in the user's chosen order, each with its own View Header.
No Active View: every section's body is live whether expanded or collapsed.
_Avoid_: Split view, multi view, sections view; "stacked panel" (it's one
panel, not several)

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
(`ctx.ui.notify`), not sticky busy status. Brief non-busy phrases (e.g. “Silo
is ready”) use a host **status flash** on the same chrome, not busy status.
_Avoid_: Context (overloaded — ExtensionContext, context keys, focus context),
progress alone (see `ctx.ui.progress` / RFC 0001 — task-scoped, not this slot),
toast for in-flight work (toasts are for outcomes / errors, not ambient busy)

**Status flash**:
A host-only, single-shot StatusBar phrase that is **not** in-flight work — e.g.
“Silo is ready” after startup. Auto-clears after a short dwell; not multi-writer
and not exposed on `ctx.ui.busyStatus`.
_Avoid_: Busy status (in-flight only), toast (notify), splash screen

**Startup status**:
The host-owned StatusBar sequence while Silo boots — workspaces and extensions
loading, workspace layout and terminals restoring (busy status) — ending with a
brief status flash “Silo is ready”.
_Avoid_: Splash screen, loading screen, boot toast

**SideDock**:
One of the two collapsible vertical containers (left/right) on either side of
the center area. Hosts the Navigator and other Side Panels.
_Avoid_: Sidebar (OS/VS Code sense — see Navigator), side column

**Side Pane**:
A leaf of a SideDock's layout tree — one tab bar over an ordered set of Side
Panels. A SideDock holds one or more, arranged by nested row/column Splits, and
always has at least one.
_Avoid_: Slot (the retired positional term — a SideDock used to divide into a
fixed Top Slot and Bottom Slot), region, zone

**Pane Id**:
The opaque, stable identifier of a Side Pane, unique across both SideDocks. It
is what a Side Panel's placement is recorded against, and it carries no
positional meaning — never parse a dock out of it.
_Avoid_: Slot name, pane index

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
split horizontally or vertically. A CenterDock concept — the SideDock
equivalent is a Side Pane.
_Avoid_: Tab group, pane (see Side Pane, which is the SideDock's own term)

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
Dividing a Side Pane or Group into two or more sections, in a row (side by
side) or a column (stacked).
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

**Shared Side Panel Widths**:
The setting governing whether SideDock widths are global or per-workspace. On
by default. Independent of Shared Side Panel Layout — a workspace that splits a
dock into columns needs it far wider than one showing a single column, so the
arrangement and the sizing are shared separately.
_Avoid_: Global panel widths (the layout setting is the "global" one), dock size

**Peek**:
A transient overlay that reveals a collapsed side panel while the cursor sits
at that window edge. Available whenever a side is collapsed — not only in
Laptop Mode.
_Avoid_: Drawer, flyout, temporary expand

### Agent Skills

**Skill** (Agent Skill):
A reusable capability package for coding agents — typically a folder with a
`SKILL.md` (and optional supporting files) that agents load as procedural
knowledge. Distinct from a Silo extension (`core.*` / `silo.*`).
_Avoid_: Extension (Silo's plugin unit), prompt snippet, rule file (generic)

**Project skill**:
A Skill installed under the workspace folder (e.g. `.agents/skills`,
`.claude/skills`) — shared with the repo when committed.
_Avoid_: Local skill (ambiguous with "on this machine"), workspace skill
(Workspace already means the Silo workspace)

**User skill**:
A Skill installed under the user's home agent skill roots — available across
projects on this machine.
_Avoid_: Global skill (sounds like a registry-wide scope), personal skill

**skills.sh**:
The public Agent Skills directory / leaderboard used to discover and install
Skills (`npx skills add …`).
_Avoid_: Extension registry (that's extensions.getsilo.dev), skill store

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
  values exist, and both also have a Catalog Agent counterpart.
- **Catalog Agent** (`AgentDefinition.id` in `AGENT_CATALOG`: `"claude" |
"codex" | "cursor" | "copilot" | "grok" | "pi"`): a **detected-identity**
  classification, computed live from OSC/output signals against the sealed
  catalog. A Codex/Cursor/Copilot/Grok terminal is always launched at Terminal
  Kind `"shell"` and only later upgraded to `isAgent: true` once detected —
  there is no dedicated Terminal Kind for those four. The two vocabularies
  still don't line up: sharing a string (`"claude"`, `"pi"`) means the
  terminal _can_ be that agent, never that it _is_ one.
  _Avoid_: "agent type" or "agent kind" alone (ambiguous between the two);
  conflating a terminal's Kind with its detected Catalog Agent identity

> The gap this note used to record — `"pi"` terminals marked `isAgent: true`
> by Terminal Kind with no catalog entry behind them, so no activity
> detection, no resume strategy, and no `agentId`/`agentName` — closed when
> pi joined `AGENT_CATALOG` (ADR 0041).

**Sealed** (detection):
There is no public `registerAgent` / detector-registration API — `AGENT_CATALOG`
is host-internal, and every agent Silo recognizes is one entry in it (ADR 0028).
_Avoid_: Pluggable, extensible detection (explicitly rejected)

**Agent module** (`agents/<id>.ts`):
A host-internal file for a Catalog Agent with non-trivial runtime quirks
(node-wrapped argv0, fake shell OSC, settings-gated activity, in-process
hooks). Holds the catalog entry, agent-specific detectors, and declarative
`runtime` policy. Simple agents stay thin entries in the catalog index — no
forced one-file-per-agent symmetry (ADR 0042).
_Avoid_: Per-agent module for every agent (Claude/Codex-style entries are
mostly data)

**Runtime policy** (`AgentDefinition.runtime`):
Declarative host behavior for quirky agents: e.g. suppress shell-integration OSC
once identified, stamp identity from a detector, declare `processArgsMarkers`
for node-wrapped argv0. Distinct from **Install Strategy** (resume hook shape)
and from **extra settings toggles** (opt-in agent config prerequisites for
activity detection). Applied generically by the host — no agent-id string
branches in `agents-service.ts` (ADR 0042).
_Avoid_: Pi-specific branches in shared host files; conflating runtime policy
with resume or install metadata

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

**Install Strategy** (`HookInstallStrategy`):
For a `hook` agent, the on-disk shape Settings → Agents writes: the merge
algorithm and the file it applies to. `claude-settings` (Claude, Codex),
`cursor-hooks-json`, `copilot-hooks-dir`, and `pi-extension` — the last being
the one whose "config" is a Silo-owned TypeScript file rather than data,
because pi has no shell-command hooks at all (ADR 0041).
_Avoid_: Installer, adapter (prefer the field name); calling `pi-extension`
a plugin (it is Silo's hook, wearing pi's only available shape)
_Avoid_: Reconnect, restore (prefer "resume" to match the CLI verb every
catalog agent itself uses)

**Session Id**:
The exact identifier for the agent running in a terminal. Present only once an
opt-in hook (or, for Grok, its native session file) reports it — Silo never
infers one by directory/recency, since that can silently resolve to the wrong
session.
_Avoid_: Terminal id (a different, always-present identifier), Agent id
(prefer Catalog Agent id, e.g. `"claude"`, for the stable catalog key)

### Terminal Environment

**Terminal Identity**:
The facts a Silo-spawned session is told about itself, stamped into its
environment as `SILO`, `SILO_TERMINAL_ID`, `SILO_WORKSPACE_ID`,
`SILO_WORKSPACE_PATH`, and `SILO_BIN` (RFC 0028). `SILO_TERMINAL_ID` is the
**tab** (`TerminalRecord.id`), not the Session Id — a tab keeps its id when its
shell is killed and recreated, which is what makes it correlatable.
**Set once, at session creation, and never revisited** — a session outlives app
restarts and reattaching does not re-create it. Only facts that are true for the
terminal's whole life may go here; anything describing what is _running right
now_ would start lying the moment the user quits it, and belongs on the launch
line instead.
_Avoid_: Terminal env (too broad — that's the whole environment, most of it
inherited), session identity (the Session Id is a different thing)

**Reserved Namespace** (`SILO*`):
Host-owned environment keys. Caller-supplied variables under this prefix are
dropped by the host on both `spawn` and `exec`, and the drop is logged. The
point is not tidiness: agent hooks gate on `SILO_TERMINAL_ID`, so a value any
extension could set would defeat the guard that scopes Silo's instrumentation to
Silo's own terminals.
_Avoid_: Protected/private variables (they are readable by anyone inside the
terminal — the reservation is on _writing_ them)

**Session Environment**:
The env map assembled for one session: the caller's variables, minus reserved
keys, plus the stamped Terminal Identity. Built by `buildSessionEnv`, carried to
the daemon as one JSON variable, and applied in the session's own child process
so a per-session fact never lands on the daemon that owns it.
_Avoid_: Spawn env (the map is also the reattach-surviving state, not just a
spawn argument)

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
kept. Irreversible for uncommitted work when force-confirmed. The first confirm
states everything known up front — the lock (cleared as part of removing) and
whether there are uncommitted changes — but only **discarding** that work earns
a second confirm, because it's the one step nothing can undo.
_Avoid_: Delete worktree, destroy worktree

**Locked worktree**:
A worktree git has been told not to remove or prune (`git worktree lock`),
usually with a reason — the convention for a checkout on removable media or one
another tool depends on. Shown as a "locked" badge, with the reason as its
tooltip. Silo never locks a worktree on its own initiative — it reports locks,
and clears (then restores) one only in service of a Remove worktree the user
asked for.
_Avoid_: Pinned, protected, frozen

**Unlock worktree**:
Clear a worktree's lock so it can be removed or pruned again. Not a standalone
action: it's folded into Remove worktree, which states the lock in its single
confirm and names the button "Unlock and Remove". Unlocking is a step on the
way to removing, not a state users manage on its own — and not a second
decision to prompt for. If the removal it cleared the way for doesn't happen
(declined force confirm, failure), the lock and its reason are **restored** —
Silo never leaves a worktree it didn't remove unlocked.
_Avoid_: Release, force unlock

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

### Extension Storage

**Extension storage**:
The umbrella for everything Silo persists on an extension's behalf, in two
shapes: the key/value **bags** (`ctx.storage.global` / `.workspace`) and the
**storage directories** below. Always namespaced by extension id.
_Avoid_: Extension state (the host's own term for app state), extension data
(ok in UI copy for the files specifically — "Also delete its data")

**Extension storage directory**:
A directory the host owns on an extension's behalf, at
`<userConfigRoot>/extension-storage/<extensionId>/`, for real data files rather
than settings-sized values. Reachable through `ctx.files` with no `fs:*`
permission. Two scopes: **global** (`global/`, shared across workspaces) and
**workspace** (`workspaces/<workspaceId>/`, keyed to workspace identity).
_Avoid_: Extension folder / extension dir (those are the installed **code** at
`extensions/<id>`), data directory, storage root (that's the shared
`extension-storage/` parent, not one extension's)

**Own directory**:
The short form used in host code (`PathScope.ownDirs`) for the storage
directories the calling extension may touch unconditionally — global always,
plus the active workspace's when one is open.
_Avoid_: Sandbox dir (it isn't a sandbox — see ADR 0015), private dir

### Tasks

Vocabulary for the `silo.tasks` extension ([RFC 0031](proposals/0031-tasks-extension/proposal.md)),
which ships in the external `silo-extensions` repo.

**Task**:
A unit of work someone intends to do — "what to do next / what's blocked". Bound
to the _intent_, never to an agent run: a Task exists before any agent is
started and after any branch is merged. (Six of the twelve tools RFC 0031
surveyed use "task" the other way, as a synonym for an agent session — Silo does
not.)
_Avoid_: Using "task" for an agent session, a worktree, or a CI job

**Task vs Follow-up**:
Adjacent enough that users will conflate them — the glossary draws the line. A
**Follow-up** (`silo.follow-ups`, [RFC 0021](proposals/0021-follow-ups-extension-sdk.md))
is a _bookmark on a tab_ — "this editor / terminal is worth coming back to",
scoped to a workspace's open tabs and gone when the tab closes. A **Task** is a
_unit of work_ with its own record, lane, and priority, that outlives any tab
and any workspace. Marking a tab ≠ tracking work.

**Task Source**:
One resolved store of tasks, identified by its **locator** (a dedupe key — two
workspaces resolving to the same locator are one source). The provider (Silo,
and later Beads / dex) is an implementation detail _of_ a source. Phase 1 has
two, both Silo-managed: one always-present **global** source ("Personal") and
one per active workspace.
_Avoid_: "Beads workspace" reaching any UI — Beads' own term for its unit
collides with Silo's **Workspace**; the provider seam keeps it internal

**Lane**:
The closed set `todo | in_progress | blocked | done` that every provider maps
its own statuses into. Distinct from `statusLabel`, which carries the provider's
_own_ word for display; Silo groups and sorts by lane, shows the label in
detail.
_Avoid_: "Status" for the closed set (that's the display label); "column" (no
board in phase 1)

**Ready**:
A task in the `todo` lane — nothing is blocking it and no one has started it.
The hollow-ring status glyph. The state an agent (or a person) picks work up
from.
_Avoid_: "Open" (ambiguous with not-done), "backlog" (implies a separate tier)
