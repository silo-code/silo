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
The shared "saved workspaces / New workspace…" menu offered from the "+" on the
Navigator's Workspaces row (its section header in the Stacked arrangement; ADR
0048), the workspace status-bar item, and the empty CenterDock.
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

**Panel Chrome** (RFC 0039):
The **one** host-drawn strip above a Dock Panel's content — a path
**Breadcrumb** plus a contribution point for
`registerToolbarItem({ surface: "panel" })` items. A **Dock Panel Kind** opts in
with `toolbar: { breadcrumb: true }` and fills the crumbs via
`DockPanelApi.setBreadcrumb`; the Terminal is a kind that declares it, so a
terminal toolbar item is a `"panel"` item scoped by `kindId`. The Panel states
its path and the host draws it — the same "state a fact, host routes on it"
shape as **Agent Surface** — and a Panel never renders a toolbar of its own, so
a contribution can never land on a second row. (An Editor's strip is a separate,
Editor-owned composition — it carries the view switcher.)
_Avoid_: Panel toolbar (the contribution cluster is one part of the chrome, not
the whole), header (too generic — the Editor's is a different composition)

**Dock Panel Record** (RFC 0041):
The persisted identity and restore state of one Dock Panel — `DockPanelRecord`
(`id`, `kindId`, `workspaceId`, `state`, timestamps), listed on
`Workspace.panels`. It is what makes a Dock Panel first-class the way an Editor
or a Terminal is: enumerable, workspace-scoped, and **reopened from its record
on restart** rather than surviving only as opaque geometry in the saved dock
layout. A **Dock Panel Kind** opts in with `persistence: "recorded"`; a kind
that doesn't is **transient** — layout-only, not resurrected. The record list is
the source of truth for _which_ recorded panels exist; the dock layout keeps
only _where_ they sit, and the two are reconciled on restore exactly as Editors
and Terminals already are. An Editor and a Terminal are not `DockPanelRecord`s
today — `EditorRecord` / `TerminalRecord` keep their own shape; folding the
three lists into one is a later phase.
_Avoid_: Panel state (that is the `state` field, one part of the record),
Content Panel Record (the record is not center-dock-only in principle), Dock
Panel Kind (the kind is the class, the record is one instance)

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

**Agent Session** (`AgentInfo`, RFC 0038) — the entity `ctx.agents` is keyed
on: one running coding agent Silo is observing, live, with a stable `id`. Two
kinds sit beneath it:

- **Terminal session** — the agent runs in a PTY and draws its own TUI; Silo
  _infers_ activity from OSC/output signals and identity from detection (ADR
  0028). `AgentInfo.terminalId` is set; `AgentInfo.id` equals it.
- **Chat session** — the agent is an Agent Client Protocol child speaking
  JSON-RPC over piped stdio; it _reports_ activity and _declares_ its identity
  at `initialize`, and Silo renders the conversation. No `terminalId`.

`ctx.agents` reports **the same `AgentInfo` shape for both** — the promise is
observation parity, not capability parity (capabilities are advertised per
agent, the way LSP does it). `reveal(id)` brings a session into view (its
terminal tab or its transcript panel) without the caller knowing which kind it
is; `resume(id)` reloads a Chat session's transcript after its process died
(a no-op for a Terminal session — the user runs `resumeCommand`).

There is still no _persisted_ `Agent` record with identity across time; a Chat
session's `sessionId` (returned by `session/new`, reloadable via
`session/load`) and a Terminal session's hook-reported `sessionId` are the
closest thing.
_Avoid_: "ACP session" in the UI (Silo says _Chat_, not the transport — the
same way it says _terminal_, not _PTY_); "Agent object".

**Agent** (of a terminal): the Terminal-session case of the above — a
_classification of a terminal's activity_, still exposed as `AgentInfo`.
_Avoid_: treating it as a distinct type from Agent Session — it is one kind.

**Agent Surface** (RFC 0038 Session 3.2) — the dock tab an **Agent Session**
is showing on: a terminal tab for a Terminal session, or a `DockPanelKind`
panel that declared `DockPanelApi.setAgentSession(id)` for a Chat session. It
is what the host resolves so that one kind-agnostic thing can happen to either:
a tab badge routed to the right tab (`ctx.agents.bindActivity` / `bindIcon`
take an Agent Session id, never a tab id), "is the user looking at this
session" (`ctx.agents.getActive()`), and "end it" (`ctx.agents.close(id)`).

The direction matters. A terminal is a **subject** — it draws a terminal and
has no idea an agent badge exists; `silo.agents` observes `ctx.agents` and
paints onto it. A Chat panel is a subject on exactly the same terms: it
declares _what it is showing_ and nothing more. A panel that observed agent
state and painted its own chrome would be an **author**, and would sit outside
whatever settings and policy the observing extension owns.
_Avoid_: "panel adornment API" (there isn't one — the panel declares, it does
not adorn); "tab owner".

**Session Title** (`AgentInfo.title`, RFC 0038 Session 3.2) — one
host-computed display label per **Agent Session**, rendered verbatim by its
dock tab, its workspace status row, and the `silo.agents` Navigator row. Three
steps, and the two kinds are exact parallels: the agent's own words (a
Terminal session's OSC window title, a Chat session's `session_info_update`
title), then the user's name (`TerminalRecord.customName`; Chat has no rename
gesture yet), then a fallback (the terminal's derived name; the declared agent
name, else the profile label). Agent **status markers** are stripped from the
agent's words — the status is already structured state on the same record.

Volunteering a title is optional, and which agents do is a fact about the
agent _and its adapter version_ rather than anything to branch on — Cursor
sends `session_info_update`, and `claude-agent-acp` does too as of 0.75.1,
where the 2026-09-08 recon found it sending none. A session that gets no title
sits on the fallback. Silo does not invent a summary to hide that, any more
than it invents an OSC title for a CLI that writes none.
_Avoid_: deriving a label a second time in a consumer (that is how the tab and
the status row drifted); "tab title" (the tab is one renderer of it).

**Witnessed** (RFC 0038 Session 3.2) — whether the user was looking at an
Agent Session's **Agent Surface** at the instant a **Prompt Turn** finished.
The one input to the one attention rule, `needsAttention = isAgent &&
!witnessed`, which lives in exactly one place (`agent-turn-model.ts`) and is
called by both kinds. Watching a finish live _is_ seeing it, so no
acknowledgment is owed. Not the same as the session's _workspace_ being active
— keying it there once left a Chat turn finishing in a background tab of the
foreground workspace with no badge at all.
_Avoid_: "focused" (a surface can be visible without being active, and the
rule is about the active one); re-deriving it in a consumer.

**Agent Profile** (`AgentProfile`, RFC 0033; launch union RFC 0038) — a named,
user-authored recipe for **starting** a coding agent: an `id`, a `label`, an
optional `default` flag, an optional `assumedAgentId`, and a `launch`
discriminated union. Addressing (`id` / `label` / `default` / `assumedAgentId`)
is transport-agnostic — the durable idea in RFC 0033; only `launch` knows the
kind:

- **`launch.interface: "terminal"`** — `command` is a shell string (an alias /
  shell function / version-manager shim, not an argv array — Silo types it into
  an interactive login shell, never `exec`), plus an optional `configDir` for a
  second account.
- **`launch.interface: "chat"`** — `command` is an executable path, `args` an
  argv vector, `env` optional; Silo execs a pipe-connected child and speaks the
  Agent Client Protocol to it. Aliases do not resolve (no shell), which is why
  the shape is a path plus args. A second account rides `env` (keyed by the
  agent's `configDirEnvVar`) rather than `configDir`, since there is no shell
  line to prefix. Driven through **Chat Session Connection** (below), gated on
  the `chatAgents` setting.

**Composed Launch** (RFC 0038 Session 3.6) — a Chat `launch` that **Silo wrote,
not the user**: built from the catalog agent's `acpLaunch`, either the builtin's
own argv (`cursor-agent acp`) or a pinned adapter invocation
(`npx -y @agentclientprotocol/claude-agent-acp@0.75.1`). The profile editor's
Chat arm offers an **Agent picker** in place of a Command field, because the two
arms know different things: a Terminal command is a fact about the _user's_
shell, and a Chat command is a fact Silo established by recon. An agent with no
verified `acpLaunch` is absent from that picker rather than offered with a
warning. The counterpart is a **Custom launch** — the picker's `Custom…` entry,
which reveals the command/argv fields for an ACP server Silo does not ship (a
locally built binary, an adapter fork). Not a lesser path: it is the same
authoring a third party driving `ctx.agents.sessions` needs. A saved launch is
**classified, never rewritten** — one Silo recognises presents as its agent, and
anything else presents as Custom…, so re-opening a profile cannot re-author it.
_Avoid_: "suggested launch" / "prefill" (Session 3.4's superseded model, where
the user typed the line and the catalog only offered a correction).

**Profile Interface** is the user-facing name for which arm a profile uses —
**Interface: Terminal or Chat** in the profile editor (shown only while the
`chatAgents` gate is on), and `AgentProfileSummary.interface` on the public
surface. It decides the _verb_: a Terminal profile is `launch()`ed,
a Chat profile is `connect()`ed, and offering one to the other's service fails.
_Avoid_: "transport" or "protocol" (the user never meets ACP); "mode".

Host-owned global state; appears in the `+` menu, a terminal's right-click
**Agents** submenu, and on Settings → Agents → **Profiles**. A profile written
before RFC 0038 (flat `command` / `configDir`) is migrated into the `terminal`
arm at load.

- `assumedAgentId` is a **user assertion** ("this launches Claude"), matched
  from the command text and overridable in the editor. It may pick the menu
  icon and the config-dir env var; it is **never** written into
  `AgentInfo.agentId` (a proven
  **observation**) and never seeds `AgentInfo.isAgent`. A profile-launched
  terminal becomes an agent the same way every other terminal does — by
  detection (ADR 0028).
- A terminal carries `TerminalRecord.profileId` **only if Silo opened the
  terminal for that launch** (the `+` menu). A hand-typed agent — or one started
  from the right-click **Agents** submenu, which just types the profile's
  command into the terminal you're in — gets full catalog identity and no
  profile; Silo never guesses one.
- The `id` is also a **command-id component** (`core.newAgent.<id>`, RFC 0033
  phase 2) and the value `silo agent run --profile <id>` takes — which is why it
  is user-authored and editable, not derived-and-frozen. Renaming it retires
  that command; a keybinding on the old id goes inert (kept, not pruned — ADR 0046) and the editor warns first.
- **Default profile** — the one profile flagged `AgentProfile.default` (at most
  one; set only by an explicit gesture on the Profiles tab, never inferred). The
  generic **New Agent** command (`core.newAgent`) and a bare `silo agent run`
  launch it — falling back to the first profile in list order when none is
  flagged.

_Avoid_: "agent config" / "agent preset" (it is a launch recipe, not the
agent's own configuration); conflating asserted `assumedAgentId` with observed
`agentId`.

**Opening Prompt** (RFC 0033 phase 3) — the text a profile launch hands the
agent **on its launch line**, so the agent starts already working on something.
An _opening_ prompt precisely because it rides the launch: there is no way to
send a second one to an agent that is already running, and building that would
be the agent-agnostic runner the proposal rejects outright. Reachable only
through `ctx.agents.profiles.launch({ prompt })`.

The governing rule is **refuse rather than approximate**: a prompt Silo cannot
quote exactly is never typed, no agent is started without it, and the caller is
told why as a typed `PromptRefusal` — the same discipline `configDirEnvVar`
settled in phase 1, since a mechanism that looks like it worked and silently
didn't is worse than one that isn't there. The payload rides a **quoted
heredoc** (POSIX) or an exact single-quoted literal (fish), so shell expansion
is dead by construction rather than by escaping; it is _sanitized_ first,
because the bytes are typed into a **line editor** where ESC fires keybindings,
a lone CR submits the line, and a tab completes.

- **Prompt Delivery** (`AgentDefinition.promptDelivery`) — the sealed-catalog
  fact saying how an agent takes one: `{ kind: "argv" }` (positional) or
  `{ kind: "flag", flag }`. Established by empirical recon, not from `--help`
  and never guessed from the command text. The distinguishing question is not
  "does it accept prompt text" but "does it accept prompt text **and stay
  interactive**" — a mode that prints and exits is a no. `undefined` is a
  deliberate no, and the profile is then refused a prompt.
- **Shell Dialect** (`"posix" | "fish" | "unsupported"`) — which exact quoting
  rule applies to the shell a terminal will actually run. Decided **once per
  launch**, at registration, and carried on the pending launch, so the precheck
  and the drain cannot reach different conclusions. `"unsupported"` is an
  answer, not a gap: it refuses.

_Avoid_: "initial message" / "seed prompt" (use Opening Prompt); calling a
refusal an error (it is a returned value, not a throw); "sending a prompt to an
agent" for anything but the launch line.

**Chat Session Connection** (`ctx.agents.sessions`, `AgentSessionHandle`,
RFC 0038 phase 2) — the live handle an extension holds on a **Chat session**.
`connect(profileId)` spawns the agent for a user-authored `chat` **Agent
Profile** (never a command an extension supplies), runs the Agent Client
Protocol `initialize` + `session/new` handshake, and returns a handle to
`prompt` / `cancel` / `dispose` and to watch via `onUpdate` / `onPermission`.
Unlike an **Opening Prompt**, a **Prompt Turn** here is a full request/response
exchange and there can be many in one session. The whole surface is gated on
the `chatAgents` setting (off by default); every `connect()` rejects while it
is off. The same session is registered into `ctx.agents` as an `AgentInfo`
(`kind: "chat"`), its `activity` / `needsAttention` derived from the turn
lifecycle — a `session/request_permission` maps to `working` + `needsAttention`
(there is no `"blocked"` in `AgentActivity`).
_Avoid_: "ACP client" / "ACP session" in user-facing text (Silo says _Chat_);
calling `connect()` a "launch" (a launch is the Terminal-profile verb).

**Transcript** (RFC 0038 phase 3) — the rendered conversation of a **Chat
session**: the agent's streamed text, its thinking, its tool-call rows, its
plan, and any inline permission request, projected from the `onUpdate` stream.
A **Terminal session** has no transcript — it has _scrollback_, which the agent
itself drew and Silo cannot decompose.
_Avoid_: "chat log" / "history" (history is the agent's own stored
conversations, which Silo reaches via `session/load`, not what is on screen);
"output" (that is the Output panel).

**Update stream** (`AgentSessionUpdate`, RFC 0038 Session 3.8) — the normalized
sequence of `session/update` notifications a **Chat Session Connection**
delivers through `onUpdate`, and the SDK's projection of the Agent Client
Protocol — **not** the wire format itself. Everything a **Transcript** must draw
is a modelled field (`text` / `content` for the message kinds, `toolCall` for
`tool_call` and `tool_call_update`, `plan` for `plan`); `raw` is the **escape
hatch**, carrying the untouched protocol object for the kinds deliberately left
unmodelled (`available_commands_update`, `usage_update`, a vendor's `_meta`).
The distinction is the contract: **`raw` tracks the protocol, not Silo's
semver**, so a field inside it can change under a consumer with no SDK major,
while a modelled field cannot. Needing `raw` for something every Chat UI must
render is a reportable gap in the surface, not a workaround to write.
_Avoid_: "the wire format" for the update stream (they are deliberately
different things); "raw fields" for anything modelled.

**Chat session resurrection** (RFC 0042) — bringing a **Chat** Agent Session
back after its process died with the app: the panel persists
`{ sessionId, profileId, cwd }` in its **Dock Panel Record**, and on restore
reconnects the agent's own context over **resume** (no replay) or **load**
(replay), falling back to the **transcript journal**. The precise claim: the
_session_ — the transcript plus the ability to keep talking — resurrects; the
_process_ and any in-flight **Prompt Turn** do not. Inside a running app a
background Chat agent stays alive; after RFC 0042 Phase 2 it also survives a
webview reload; it never survives a quit.
_Avoid_: "session restore" (too close to workspace/layout restore), "keeping the
agent alive" (the agent process is exactly what does not survive).

**Transcript journal** (RFC 0042) — the app's own append-only record of a Chat
session, one **Update stream** entry (`SessionUpdate`) per line at
`<workspace-state-dir>/chat-sessions/<sessionId>.jsonl`. It is durable, typed
(not raw wire), and independent of the agent — so a panel paints instantly on
reopen and an agent that replays nothing still shows its history. Distinct from
the **frame log**.
_Avoid_: "history" (that is the agent's own store), "cache" (it is a
system-of-record, not a derived copy).

**Dormant Chat session** (`chatResumeState: "dormant"`, RFC 0042) — a **Chat**
Agent Session Silo knows about but has not connected to this run: its **Dock
Panel Record** exists and its last-known status was persisted, but no agent
process is alive and no `connect()` has run. This is what every Chat session in
a workspace the user has not visited since launch looks like, and listing it is
the point — the Agents navigator shows it with the title it last had, and
revealing it activates the workspace and the tab, which is what starts the
reconnect. Always `activity: "idle"`: there is no live turn to be working on.
The Chat counterpart of a Terminal session tracked from its terminal record
before anything attaches.
_Avoid_: "stale" (that is the soft, self-clearing doubt about a restored
_duration_ — a dormant session has no duration to doubt); "dead" (a dormant
session is expected to reconnect on open; `activity: "dead"` is structural and
does not); "cached session".

**Frame log** (RFC 0042 Phase 2) — a bounded in-memory buffer of the raw
JSON-RPC frames on one ACP connection, held in `acp.rs` with a pinned head (the
`initialize` / `session/new` responses) and a visible truncation marker. It
backs **reattach** across a webview reload: `acp_attach` replays it, then
streams live, bracketed the way RFC 0036 brackets PTY replay. Distinct from the
**transcript journal**, which is typed, durable, and the conversation-of-record;
the frame log is untyped, ephemeral, and exists only to re-sync a live
connection.
_Avoid_: conflating it with the journal; "transport buffer" (it is protocol
frames, keyed for id/answered tracking, not opaque bytes).

**Resume vs. load** — two distinct ACP agent capabilities, not one.
`session/resume` (gated on `sessionCapabilities.resume`) reconnects to a session
**without** replaying its history — fast, and the only resume path in ACP v2.
`session/load` (gated on `agentCapabilities.loadSession`) reconnects **and**
replays every prior turn as `session/update` notifications. Silo prefers
`resume` when both are advertised and renders the transcript from the
**transcript journal** in that case. `loadSession` and `session/list` are
universal across Silo's catalog, and `claude-agent-acp` 0.75.1 advertises
`resume` too (probed directly 2026-09-10 — the earlier "not on claude" reading
was Silo mis-parsing the capability, not the agent lacking it).
**How a capability arrives is not fixed**: `true` and a details object
(`resume: {}`) both mean supported, and the block may sit at the top level or
nested under `agentCapabilities`. Read presence, never `=== true`.
_Avoid_: "reload the session" for `resume` (it explicitly does not); treating
`canResume` on `AgentInfo` as either specific method — it means "one of them
works"; concluding an agent lacks a capability from one build's wire shape.

**Reattach** (extended by RFC 0042) — re-establishing a client's connection to
a still-running session it lost hold of. Already the **Terminal session** word
for reconnecting to a daemon-held PTY after a restart; RFC 0042 Phase 2 gives a
**Chat session** the same word for reconnecting to a `acp.rs`-held ACP
connection after a webview reload, via the **frame log**. Reattach is a
same-process reconnect; **Chat session resurrection** is the cross-quit rebuild.
_Avoid_: using "reattach" for the cross-quit case (that is resurrection —
the process is gone).

**Chat panel** (`core.acp-chat`, RFC 0038 phase 3) — the bundled center-dock
surface that holds one **Transcript** and its composer. One panel binds to one
**Chat** Agent Profile; switching the profile is a teardown, not a re-render.
It is an ordinary extension built on `ctx.agents.sessions` and `@silo-code/sdk`
alone — deliberately claiming no privilege a third-party Chat UI lacks — and
registers only while the `chatAgents` gate is on, and is disabled and replaced
the same way as any other extension.
_Avoid_: "ACP panel" (Silo says _Chat_); "agent panel" (that is the
`silo.agents` Navigator view, which lists every Agent Session); calling it the
Chat session — the panel is the UI, the session is the running agent.

**Agent Profile is the launch vocabulary; Catalog Agent is the identity
vocabulary; Terminal Kind is neither.**

- **Catalog Agent** (`AgentDefinition.id` in `AGENT_CATALOG`: `"claude" |
"codex" | "cursor" | "copilot" | "grok" | "omp" | "pi" | "opencode"`): a
  classification against the sealed catalog. `"omp"` and `"pi"` are
  **separate** catalog agents, not one "pi family" — OMP is a fork with its
  own binary, config home, and resume syntax (RFC 0037), and collapsing them
  would put Silo's hook in the wrong directory and offer the wrong resume
  command.
- **Terminal Kind** (`TerminalKind`: `"shell" | "claude" | "pi"`): the
  `"claude"` / `"pi"` values are **deprecated** (RFC 0033). Nothing creates
  them, a persisted record carrying one is normalized to `"shell"` at load, and
  `ctx.terminals.create({ kind: "claude" | "pi" })` now creates a `"shell"`
  terminal (launching a matching profile if one exists). `AgentInfo.kind` no
  longer carries Terminal Kind at all — as of RFC 0038 it is the Agent
  Session discriminator (`"terminal" | "chat"`).
  _Avoid_: "agent type" or "agent kind" alone (ambiguous); treating Terminal
  Kind as either the launch or the identity vocabulary — it is a vestige.

**Identity provenance** — how Silo comes to believe an Agent Session is a
particular Catalog Agent. Three sources, in decreasing certainty:

- **Observed** (`AgentInfo.agentId`) — a Terminal session's identity, proven
  live from OSC/output signals against the sealed catalog. A terminal is
  upgraded to `isAgent: true` and given an `agentId` only once detection says
  so.
- **Declared** (RFC 0038) — a Chat session's identity, stated by the agent
  itself at `initialize`. Accepted, and _not_ a reopening of sealed detection
  (ADR 0028): a Chat session has no classifier to diverge, so there is no
  ambiguous signal for several consumers to disagree about.
- **Asserted** (`AgentProfile.assumedAgentId`) — a user's claim on a profile
  ("this launches Claude"). Picks the menu icon and the config-dir env var;
  **never** written into `AgentInfo.agentId` or used to seed `isAgent`.

> Earlier gaps this note recorded — `"pi"` terminals marked `isAgent: true` by
> Terminal Kind with no catalog entry — closed when pi joined `AGENT_CATALOG`
> (ADR 0041); the Kind values themselves retired as launch vocabulary in favour
> of Agent Profiles (RFC 0033).

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

**Replay** (of a session):
The scrollback a session host sends a client on attach, out of the bounded ring
it keeps for exactly this purpose. It is the session's recent past, not its
present — and on the wire it now says so, bracketed by `T_REPLAY_BEGIN` /
`T_REPLAY_END` so no consumer has to guess (RFC 0036). Everything above the
seam carries the distinction as an `OutputOrigin`, and `ctx` withholds replay
unless a subscriber opts in with `includeReplay`.
_Avoid_: Scrollback (that's the content; Replay is the act of re-sending it, and
Silo has a second, unrelated scrollback source in the persisted xterm buffer),
history (too vague), buffer (the ring, the persisted buffer, and xterm's own
buffer are three different things)

**Live Output**:
Bytes the session is producing now, as opposed to Replay. The distinction is
the difference between evidence and news: replayed bytes are legitimate
_evidence_ of what a terminal is running — often the only evidence, on a
terminal Silo has only just attached to — but only live output is _activity_,
and only activity may raise attention or ring a bell.
_Avoid_: Real-time output (nothing here is real-time in the scheduling sense),
new output (a replayed chunk is also new to the client that just received it)

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

### Command Line

Vocabulary for the `silo` command's namespace ([ADR 0047](decisions/0047-cli-command-grammar.md)).

**CLI (the `silo` command)**:
The user/runtime binary that drives a running Silo instance from a terminal —
open a path, install an extension, run an agent profile. Its **primary consumer
is coding agents**, humans second, and that premise is what the grammar is
designed around. Distinct from the authoring scaffolder
(`create-silo-extension`).
_Avoid_: `silo-ext` (withdrawn, [RFC 0007](proposals/0007-extension-authoring-toolchain.md));
"the CLI" as if it were a standalone tool that answers on stdout — most of it
does not yet

**Canonical form**:
The one spelling of a capability: `silo <noun> <verb> [args]`. Host verbs match
`[a-z][a-z0-9-]*` and never contain a dot. Every capability has exactly one.
_Avoid_: Subcommand (too generic — verbs under a noun are subcommands too)

**Shorthand**:
A frozen top-level synonym for a canonical form, kept for human ergonomics —
`silo <path>` for `silo ws open <path>`, `silo install` for `silo ext install`.
A closed set that never grows.
_Avoid_: Bare verb / bare alias (describes the shape, not that it is sugar over
a canonical form); "the default command"

**Reserved noun**:
A first positional that is never a path — `ext`, `ws`, `agent`, `term`, `help`.
Closed set, grown only by amending ADR 0047. `./<noun>` and `silo -- <noun>`
always still address a folder of that name.
_Avoid_: Top-level command (collides with the shorthand path form)

**Execution mode**:
Who answers a command: **Local** (the binary itself), **Disk-read** (the binary,
reading ADR 0022's config tier — no GUI needed), **Forward** (the running app,
fire-and-forget, exit 0), **Control** (the running app, round-trip, real stdout
and exit code — the [Control API](proposals/0034-control-api.md)). The
dividing line: config lives on disk, live state needs Control. A command may be
**both**: `silo ws list` is Disk-read with a Control **overlay**, and the answer
records whether the overlay was applied so "not open" and "unknown because
nothing was running" stay distinguishable.
_Avoid_: IPC / RPC as a synonym for Forward (the dev automation channel,
[ADR 0012](decisions/0012-dev-automation-rpc.md), is a different surface);
"async" for Forward (the problem is that there is no answer, not that it is late)

**Control API**:
The request/response channel a `silo` command uses to ask a running instance
something and print the answer — an OS-gated Unix socket (Windows: named pipe)
in ADR 0022's runtime tier, one newline-delimited request and one response per
connection. Not reachable by a browser, a page, or the network; not reachable by
extensions, which have `ctx`. Distinct from the **dev automation RPC**
([ADR 0012](decisions/0012-dev-automation-rpc.md)), which is a loopback HTTP
server compiled out of release builds.
_Avoid_: "the CLI server" / "the daemon" (nothing long-running is added — the
app itself listens); "the IPC channel" (Silo has several)

**Envelope**:
The one JSON shape every Control response takes, on the wire and on `--json`
stdout: `v`, `ok`, then `data` **or** `error`, plus `silo` (version, identity).
`v` versions the envelope as a whole and changes only on a breaking change to
that shape; a command's own `data` is documented per verb and grows by adding
fields.
_Avoid_: Payload / result (those are `data`, the part _inside_ the envelope);
"the response format" when the per-command `data` shape is what is meant

**Op**:
One named entry in the Control API's **allowlist** — `status`, `ws.live`,
`agent.run`. A closed set: a name not in it is refused with `denied`, so the
channel never becomes a passthrough to whatever the host can do. Each op is
labelled **read** or **mutate**; the label is documentation and audit surface,
not a second runtime gate (there is only one principal behind a `0600` socket).
No op may require user confirmation — one that would is not admitted.
_Avoid_: Command (a `silo` command may send an op, send none, or send one only
as an overlay); endpoint / route (there is no URL space)

**Readiness**:
Whether a running instance's webview has registered its Control dispatcher and
can serve ops. Reported by `silo status` as `webview: "ready" | "starting"`, and
what `--launch` waits on. Deliberately **not** the same as the socket existing:
the socket is bound at process start, so its presence means only "the process is
alive" — which is what lets a wedged app be told apart from no app at all.
_Avoid_: "running" / "up" for readiness (an instance can be running and unable
to answer); "loaded"

**CLI workspace identity**:
How a workspace is addressed on the command line: the folder path of its primary
`folder` or an `extraFolders` entry — matched exactly, or by **containment** for
any path underneath it. `ws_<uuid>` is accepted wherever a workspace is named,
for machine callers that need a handle surviving a rename; `--json` returns it.
Never the display name, which collides.
_Avoid_: Targeting by name; treating cwd as the workspace (cwd resolves relative
paths, and is separately one fallback rung of workspace inference)
