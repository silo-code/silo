---
status: accepted # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-09-09
---

# 0042. Chat session resurrection — across app restart and machine reboot

## Summary

A Chat session's agent process dies when the app quits. The user expects the
conversation — and the ability to keep talking to it — to come back on the next
launch, the way a terminal's PTY does. This RFC makes that real, **rebased on
ACP as it stands today** (see [`acp-process-ownership.md`](../acp-process-ownership.md),
the evaluation this RFC implements):

1. The app persists `{ sessionId, profileId, cwd }` in the panel's
   `DockPanelRecord` (RFC 0041, landed).
2. On restore it re-establishes the session over the **capability the agent
   advertises** — `session/resume` (reconnect, no replay) preferred,
   `session/load` (reconnect + full replay) otherwise — negotiating the ACP
   protocol version rather than hardcoding 1.
3. The app journals the typed update stream to disk as a conversation-of-record
   independent of the agent, so a panel paints instantly and an agent that
   replays nothing still shows its history.
4. An agent that can do neither gets an explicit degraded state.
5. **Reboot is the same path as restart.**

The 2026-09-09 recon (`acp-process-ownership.md` §5) verified the mechanism
against the whole catalog: `loadSession` and `session/list` are universal,
`session/resume` is on 3 of 5 agents, and `claude` / `cursor` / `opencode` /
`pi` all replay full transcript **content** on `session/load` — the "Cursor
sends no message chunks" fear (Zed #56246) did not reproduce.

This is a **phased** change. Phase 1 is ACP sprint Session 4 and this RFC's
first deliverable; Phases 2–4 are named here and scoped when they start.

## Motivation

### Terminals survive restarts; Chat sessions should too

Silo's promise is "all your projects alive at once." A terminal delivers on it
across an app restart via the session-host daemon: the PTY outlives the app, and
the panel reattaches. A Chat session today just vanishes — quit the app, and the
transcript and the agent are both gone. A user who has learned that terminals
come back will reasonably expect agents to.

### The real gap is Silo's client, not the agents

`acp-jsonrpc.ts` knows only `session/load` and hardcodes `protocolVersion: 1`.
Meanwhile every agent in the catalog advertises `loadSession` **and**
`session/list`, and three of five advertise `session/resume` — the method that
reconnects without a replay, which ACP v2 makes the _only_ resume path
(`session/load` is removed, `session/resume` + an optional `replayFrom` cursor
covers both). RFC 0042's earlier draft branched solely on `loadSession`; an
agent with `resume` and not `load` would have fallen to journal-only despite
being fully continuable. No such agent exists today, but the branch order is
wrong for where the protocol is going. Fix it now.

### The spike's wiring was broken; RFC 0041 fixed the cause

`AcpChatPanelParams` gained `sessionId`, persisted through `api.updateParameters`
into `ws.dockLayout`, and it did not carry back on remount — the panel restored
with an empty transcript. RFC 0041's `DockPanelRecord.state` is a structured
field on a real record, not a value smuggled through dockview's layout blob, and
it round-trips (verified, RFC 0041 §"verification").

### The daemon was reconsidered and deferred, not dismissed

`acp-process-ownership.md` re-opened the "a long-lived process owns the agent"
model (Paseo's) now that Silo has a daemon to extend and a competitor shipping
it. It stays deferred: a detached holder has **no responder** for the agent's
`session/request_permission` / `fs/*` / `terminal/*` requests, so "the agent
keeps working while the app is closed" is false for any turn that needs
approval — which is most interesting turns. What survives a quit is the
_conversation_, and `resume`/`load` + the journal deliver that. The daemon's
triggers are written down in §"The trigger to revisit the daemon".

## Design

### Phase 1 — persist, restore over the right capability, journal

#### What the app persists

Per Chat panel, in `DockPanelRecord.state` (RFC 0041):

```ts
interface ChatPanelState {
  sessionId: string | null; // from session/new; null until first connect
  profileId: string; // which Agent Profile spawned it
  cwd: string; // working directory the agent was launched in
}
```

Durable — it lives in the workspace record on disk, **not** `$TMPDIR`, so it
survives a reboot. `profileId` + `cwd` are enough to respawn the agent even if
`sessionId` is stale or missing.

#### The restore flow, on panel mount

```
record.state.sessionId?
├─ no  → session/new → fresh session, same panel + profile + cwd
└─ yes → initialize (offer protocolVersion 2; use whatever it negotiates)
         ├─ sessionCapabilities.resume     → session/resume(sessionId, cwd, mcpServers)
         │                                   → render from the JOURNAL (fast; no replay)
         ├─ agentCapabilities.loadSession   → paint the journal immediately, then
         │                                   session/load(sessionId, cwd, mcpServers);
         │                                   reconcile the replayed updates against it
         └─ neither, or the call errors     → JOURNAL-ONLY, read-only, with a
                                              "Continue in a new session" action
                                              (session/new, same panel + profile)
```

Rules:

- **Probe `sessionCapabilities.resume` and `agentCapabilities.loadSession`
  separately.** `resume` wins when both are present — it is faster and it is the
  v2 path.
- **Always send `sessionId`, `cwd` and `mcpServers`** (even an empty
  `mcpServers: []`) to `resume` / `load` — some agents reject a missing field
  with "Invalid params" (Paseo's Devin CLI note; Silo already does this).
- **Never refuse to open the panel.** A vanished or stale session falls through
  to `session/new` — an authored-but-unopenable Chat panel is the state RFC
  0038/0039 spent effort eliminating.
- **`session/load` returns a fresh `sessionId` on `claude`** (recon §5.3). When
  `load` is the path, adopt whatever id it returns into `ChatPanelState`.

#### The transcript journal — the conversation-of-record

The app appends the **typed update stream** (RFC 0038 Session 3.8 — modelled,
not raw ACP wire) to a per-session log:

```
<workspace-state-dir>/chat-sessions/<sessionId>.jsonl
```

One `SessionUpdate` per line. This is the guarantee the _conversation_ never
dies, decoupled from the agent process:

- **Instant paint** on reopen — render the journal before `resume`/`load`
  returns.
- **The record for a `resume` (no-replay) reconnect** — the agent sends nothing,
  the journal is the transcript.
- **The only record for an agent that can do neither.**
- **Reboot-safe** — durable disk.

**No on-disk compaction in Phase 1.** Every catalog agent replays the whole
transcript on `load` in one shot, and Paseo — the only comparable that handles a
long session — windows it in the UI, not on disk. Window the render (mount
recent N turns, "load older" on demand). Add a compacted snapshot only if a
real session measurably drags on reopen; shape that boundary as a **cursor**
when it comes (that is what `replayFrom` will take).

#### `session/close` on a clean teardown

When the user closes the Chat panel (not on a crash), call `session/close` if
`sessionCapabilities.close` is advertised (3 of 5 agents), then kill the process.
Today Silo only kills. `close` lets the agent free its own resources and mark
the session ended in its store.

#### Reboot

No separate mechanism. A reboot is a harder restart: the process is definitely
gone, `$TMPDIR` may be cleared. The flow above reads only durable state (the
record + the journal + the agent's own on-disk store). Failure modes to
document, not solve:

- **An agent that keeps session state in `$TMPDIR`** loses agent-side resume
  after a reboot and falls to journal-only. The recon found none among
  `claude` / `cursor` / `opencode`; `pi` is unverified (its `session/list`
  returned empty right after a `session/new`) and `codex` is unverified (no
  login). Record per-agent in the catalog with a `lastVerified` date.
- **Auth expired during downtime** — `resume` / `load` / `new` returns
  `auth_required`; the panel shows the existing auth flow.

#### The `ctx.agents` surface

`ctx.agents.resume(id)` already exists in the glossary as "reloads a Chat
session's transcript after its process died." This RFC is its implementation.
`AgentInfo` gains a resurrection status a consumer can render:

```ts
type ChatResumeState =
  | "live" // process running
  | "resuming" // resume / load in flight
  | "resumed" // reconnected, live again
  | "journal-only" // agent can neither resume nor load; transcript shown, not continuable in place
  | "unavailable"; // no sessionId and no journal — nothing to show
```

#### Phase 1 — what actually shipped (Session 4)

`ctx.agents.sessions.connect()` gained a `resume?: AgentSessionRestore`
option (`{ sessionId, startFresh? }`) rather than a bespoke restore call:
`connect()` already owns the profile/workspace/cwd handshake, so the restore
flow runs inside the same call and returns the same `AgentSessionHandle`,
now also carrying `sessionId` (a live getter — an in-place `ctx.agents.
resume(id)` can still adopt a new one after the handle was returned),
`resumeOutcome` (`"new" | "resumed" | "journal-only"`), and `journal` (the
prior turns to paint, from the same reducer `onUpdate` already feeds). A
`"journal-only"` handle's `prompt()` rejects — the read-only tier is a
property of the connection, not a separate call shape.

**"Paint from journal" is a separate call, on purpose.** `connect({ resume
})` also pays for the `session/resume` / `session/load` network round trip
before it resolves, so `AgentSessionsService.readJournal(sessionId)` reads
the journal alone — fast, local disk, no agent involved — for the panel to
paint on mount _before_ `connect()` returns. The two run independently; the
Chat panel's own `connect()`-time `journal` is the more current copy
(a `load`'s own replay lands through it) and simply re-paints on top.

**Where the journal-only "Continue in a new session" ends up filed** (open
question 2, corrected after live verification): `resume: { sessionId,
startFresh: true }` skips straight to `session/new`, reading the old journal
under the persisted `sessionId` and carrying it into whatever id `session/new`
mints — the panel then persists **that new id**, exactly as after any other
`connect()`, not the one already known to be unresumable. The first version
of this shipped keeping the _original_ id "for journal continuity"; live
verification (2026-09-09, `claude`) caught the actual consequence: every
future restore then keeps retrying an id the agent has already shown it can't
resume, forever, even while the live conversation under the new id works fine
turn after turn. Re-keying the journal to the new id (the same mechanism a
`session/load` id-adoption already needed) fixes it for the cost of nothing —
the journal is a durable record either way, addressed by whichever id is
actually live.

**The `chatResumeState: "resuming"` transient, deferred at first ("nothing
emits it yet"), turned out to matter more than the design anticipated** —
Dave's own testing found that a restored panel's tab, workspace row, and
Agents navigator entry all sat on the plain profile label until the whole
reconnect finished, discarding a title the agent had already volunteered
before the app closed. `initialize` alone measured 3.7–6.5s live, entirely
before `resume`/`load` even starts. Fix: `connect()` takes a `title` option
and, whenever `resume` is given, registers a placeholder `AgentInfo`
synchronously — before `initialize` is even called — carrying that title (or
the profile label, honestly, if none was passed) and `chatResumeState:
"resuming"`. The placeholder is overwritten in place by the real registration
in the common case (same id), and explicitly removed if the id moves out from
under it (a `session/load` adoption, or falling through to a brand-new
`session/new`) or the attempt fails outright — no dangling phantom entries.
The panel persists whatever `AgentInfo.title` last was into `ChatPanelState`
the same way it already tracked `sessionId`, and passes it back as `title` on
the next `connect()`.

**…and that title then had to survive the handshake it was painted ahead of**
(Session 5, again from Dave's testing). The placeholder was right; the _real_
registration was not — it set `AgentInfo.title` from the agent's `initialize`
product name unconditionally, so a restored tab snapped from "Plum" back to
"Claude Agent" the moment the connection came up, and the panel dutifully
persisted the regression over the good title. The fallback is now written out
in full and in order: **a title the agent volunteers during this connect**
(a `session_info_update` — which for a `session/load` arrives _mid-handshake_,
before the registration does), then **the persisted title** (`options.title`),
then the agent's declared name, then the profile label. The mid-handshake half
needed the same lesson the journal writer did: `infoId` was empty string until
after the handshake, so every `patchChatAgent` during a replay — a volunteered
title, a permission's attention — was addressed to an id nothing was filed
under and silently dropped. The placeholder now _names_ the session for the
whole handshake.

#### Sessions Silo can list before anything connects (Session 5)

A Terminal session is visible the instant the app boots: `agents-service.ts`
tracks one per terminal record in **every** workspace, off `AppState.
agentState`, with no UI involved. A Chat session had no such path — its
`AgentInfo` was born inside `connect()`, and `connect()` only runs when the
panel mounts, which for a background workspace never happens until the user
visits it (`CenterDock` mounts a `WorkspaceDock` only for workspaces warmed
this run). Restart into workspace B and the Chat agent still waiting in
workspace A was simply _absent_ from the Agents navigator — the one place a
user goes to find it — until they already knew to go to A.

Closed the same way the terminal side does it, from persistence rather than
from UI:

- `AppState.chatSessionState` — the Chat counterpart of `agentState`, keyed by
  Agent Session id, holding what a row needs and nothing that belongs to a live
  connection: workspace, session id, title, agent name/id, `canResume`. Written
  whenever a live session's identity actually changes (a timestamp-only diff
  writes nothing, so a turn costs no persistence).
- **Dormant registration**: every recorded Chat panel, in every workspace, gets
  an `AgentInfo` with the new `chatResumeState: "dormant"` and `activity:
"idle"`. Both halves are required — a record _and_ a persisted status — so a
  closed tab's conversation stays closed and a status whose panel is gone is
  pruned rather than resurrected. Revealing one records a panel-activation
  intent for its dock (the same mechanism a cross-workspace terminal focus
  uses); the panel then mounts, `connect({ resume })` runs, and the live
  registration replaces the dormant entry under the same id.

Nothing here spawns an agent or reaches the network: a dormant entry is a claim
about the past, not a connection. Lazy connect-on-open is deliberately kept —
the fix is that the session is now _findable_ while it stays lazy.

#### Capability detection, corrected (Session 5a)

`session/resume` is preferred over `session/load` "when both are advertised" —
and Silo never once took that branch against `claude-agent-acp`, because it read
the capability wrong. The agent sends details objects nested under
`agentCapabilities` (`sessionCapabilities: { resume: {}, close: {}, list: {} }`),
and the code tested `=== true`. Every claude restore therefore went through
`session/load`, which that adapter implements as a fork. One reader now decides
it for all of them — `capabilityEnabled()`: `true` or any details object means
supported, absence and `false` mean not.

The bug that exposed this is worth recording as a **limit of the design**: a
session whose id the agent's own index has dropped cannot be restored by any
path. Probed directly against a bare adapter — `resume`, `load` and `list` all
deny an id whose native transcript file is sitting on disk. The transcript
journal is exactly what makes that survivable: the conversation still paints,
and "Continue in a new session" carries it into a live one. Phase 3's
`session/list` should be consulted _before_ attempting a restore, so a dead id
is a known state rather than a failed round trip.

#### Restore fidelity, and the suite that enforces it (Session 5b)

Everything above restores a session's _identity_. Dave's side-by-side
screenshots showed that is not the bar: an agent reading **"Ready · 11s"** with
a green dot came back **"Idle · 2s"** and grey, and its tab came back without
the agent's icon. The bar is that a Chat session looks the same after a restart
as it did before it.

- **Status is persisted and restored, not re-derived.** `PersistedChatSession`
  carries `activity`, `needsAttention` and `attentionSince`. Attention survives
  with its original timestamp — "the agent finished and you have not looked" is
  still true, and the row's elapsed time is measured from it. `working` never
  survives: the process that was mid-turn is gone, so it comes back `idle` and
  `stale` (the soft, self-clearing signal the terminal side already uses), never
  as a spinner nothing will stop. `error`/`dead` describe a process this session
  does not have yet, so they are not carried either.
- **The tab is bound to its session before the panel mounts.** Tab chrome — the
  brand icon, the activity badge — resolves through the panel→session map, which
  only a mounted panel used to write. The dormant registration writes it from the
  record, so a restored tab carries its agent's icon immediately and closing it
  while nothing is mounted removes the record.
- **A failed connect falls back to the dormant row.** A connect that throws (a
  missing binary, an auth wall) removes the registration it made; without a floor
  the session vanished from the navigator entirely — tab open, conversation on
  disk, no row anywhere.
- **A panel is told which workspace it is in** (`DockPanelProps.workspaceId`,
  resolved from its _record_, not from whichever dock has registered itself yet).
  A Chat session's `connect()` defaulted to the _active_ workspace, so a session
  reconnecting while the user was elsewhere was filed under the wrong one — and
  moved back on the next restart, when the record decided. A blank workspace id
  now falls back rather than failing the connect outright.

**The store a session lives in is part of its identity.** An agent CLI keeps its
sessions inside its config directory, read from an env var Silo inherits from
whatever launched it — so a session created by an app started from one shell was
invisible to the same app started from another, and was reported as
unresumable. `PersistedChatSession.configDir` records what the child actually
got (`acp_spawn` reports the effective value), and every later restore is
spawned against it.

**Verified by a suite, not by hand.** `apps/desktop/src/automation/
chat-restart-fidelity.it.test.ts` drives the matrix this RFC always needed:
several sessions, in different states (one finished-unseen, one acknowledged),
across two workspaces, through a **real quit and relaunch**, then diffs identity
and status field by field, checks each restored tab's binding, and reopens one
to confirm it reconnects rather than degrading to `journal-only`. It is opt-in
(`SILO_IT_RESTART_APP=1`) because it restarts the app, and it needs a real Chat
profile. Every bug in this section was found by hand first; the suite is what
keeps them found.

#### Restore fidelity, per agent (Session 6)

The suite had only ever run against `claude`. It takes
`SILO_IT_CHAT_PROFILE=<id>`, so the same matrix runs against any Chat profile —
run it against the other five ACP-capable catalog agents, one real profile
each (built-ins at their resolved binary path; `codex`/`pi` as
`npx -y <package>@<pinned version>`).

| Agent    | Suite         | `sessionCapabilities` (initialize)                                                                                                            | Restore path                                                                                                     | Transcript source |
| -------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------- |
| cursor   | 4/4 pass      | `{ list: {} }` — no `resume`, no `close`, no `fork`                                                                                           | `session/load`                                                                                                   | agent             |
| opencode | 4/4 pass      | `{ close: {}, fork: {}, list: {}, resume: {} }`                                                                                               | `session/resume`                                                                                                 | agent             |
| copilot  | 4/4 pass      | `{ close: {}, list: {} }` — no `resume`, no `fork`                                                                                            | `session/load` **throws "Internal error" at runtime** for both real sessions tried; falls back to `journal-only` | journal           |
| codex    | blocked (env) | `{ resume: {}, list: {}, close: {}, delete: {}, fork: {}, additionalDirectories: {}, subagents: {} }` — same nested-details shape as `claude` | untested — `session/new` never completes                                                                         | n/a               |
| pi       | 4/4 pass      | `{ list: {}, delete: {} }` — no `resume`                                                                                                      | `session/load`                                                                                                   | agent             |

All five shapes are read correctly by the one generic `capabilityEnabled()`
reader from Session 5a — the first time it has been exercised against anything
but `claude`. Absence of a key, `false`, and a nested details object are all
handled correctly regardless of which agent sends them. **No new
capability-shape bug, and no restore path silently degraded** — copilot is the
interesting case, and it degrades exactly the way this section designed for:
`session/load` throws (a real, reproducible runtime error from that adapter,
not a Silo misread), the client is disposed, the dormant row survives rather
than vanishing, and the reopened tab still passes the suite's "must not be
`journal-only`" assertion — a later, solo retry of the same call succeeds once
the other session's concurrent load is out of the way. None of the four passing
non-`claude` agents rename a session's title on restore (no `session_info_update`
from any of them); the tab keeps its literal first-prompt text or the generic
profile label.

`codex` is blocked by the recon machine's environment, not by Silo: `codex
login status` reports "Not logged in" (a custom enterprise `~/.codex/config.toml`
setup, not a standard `codex login`), so `codex-acp` never completes
`session/new` and the suite's retry loop runs to its outer timeout. Probed
directly (bypassing the suite), `codex`'s `initialize` response advertises the
same capability shape as `claude` — nothing in that shape suggests a
mishandled restore once it can authenticate; this needs a machine with a real
`codex login` session to close out, not a code change.

Two things reconfirmed, both already tracked as Phase 2 work, not new bugs:
the **process-group leak** (an app restart never reaps a live ACP agent child —
every non-`claude` agent left orphaned processes after its restart), and a
**queued-launch drain that can outlive the run that queued it** (a blocked
codex spawn fired during a _later_ agent's run, after `afterAll` had deleted its
own tmpdir, crashing harmlessly into a different test's log — the Session 4
"queued Chat launch" finding, shown here to span more than one restart). A
transient connect-then-instantly-dispose pair, seen once per non-`claude` agent
right at `activateWorkspace`/`activatePanel`, is Dockview's default
`onlyWhenVisible` unmounting the tab that loses focus (pre-Phase-2
`renderer: "always"`) — an artifact of switching which of a workspace's two
Chat tabs is active, not a per-agent behavior difference.

#### Two lifecycle gaps, closed (Session 6a)

Both were "Chat should behave like Terminal" gaps left open by Session 5b, and
both are fixed the way the terminal side already does it — from the host, not
from a panel unmounting.

- **A deleted workspace reaps its live Chat sessions.**
  `WorkspaceService.delete()` and the workspace menu's delete both hand-reap
  terminals (`reapWorkspaceTerminals`); they now also call
  `reapWorkspaceChatSessions`, which `dispose()`s every live session in that
  workspace (`session/close`, then kill) and withdraws the dormant rows. The
  session handle's `dispose` reaches the registry as an optional
  `ChatSessionControls.dispose`, set once `connect()` has built the handle. Was:
  a live ACP child kept reconnecting on its own well after its workspace was
  gone, until killed by hand.
- **A `core.newAgent.<id>` launch cannot open its panel in the wrong
  workspace.** The command dispatch captures the active workspace before
  awaiting `startAgentProfile` and abandons quietly if it changed by the time
  the dispatch resolves — `ctx.layout.openPanel` targets the active dock, and
  the Session 5b mishap (a sandbox delete auto-activated another workspace, and
  the queued launch surfaced a Chat panel there over an unrelated conversation)
  lived in exactly that window. `pending-launch.ts` was not the cause: a Chat
  profile never enters that queue.

### Phase 2 — in-process frame buffer + reattach, and the leaks

Not Session 4. Named here because it is the natural next step and shares code
with a possible future daemon.

The ACP child is already a Rust-owned process in `acp.rs` that outlives a
webview reload — the measured 45→47 leak is the proof (the children live; only
the client is gone). What is missing is a **bounded in-memory frame log** per
connection (with a pinned head — the `initialize` and `session/new` responses —
and a visible truncation marker) plus `acp_attach(connectionId)` that replays
the log and then streams live, bracketed the way RFC 0036 brackets PTY replay.
`connectionId` is persisted in `ChatPanelState` alongside `sessionId`.

With it:

- **A webview reload survives** — reattach + replay, no respawn, no ~5s.
- The reload leak becomes a **reap-on-unclaimed** (a connection nobody attaches
  to N seconds after a page load is killed).

Everything hard about a _daemon_ frame buffer is absent in-process: no version
skew (same binary), no crash-before-record orphan (an app crash kills the
child), no two-attachers (one webview), no disk rotation, no second platform
impl. What remains is `nextId` seeding from the replayed ids and the pinned
head — both cheap, and both a strict stepping stone if the daemon is ever built.

Also in Phase 2, unrelated to the buffer:

- **The recorded Chat panel declares `renderer: "always"`.** Dockview's default
  (`onlyWhenVisible`) does not mount a panel added inactive until first
  activated, so on restart every restored Chat tab except the visible one never
  runs its connect effect — dead until clicked, then a cold reconnect. `always`
  mounts them on restore so they reconnect without a click. (A small
  `DockPanelKind.renderer` addition.)
- **Process-group kill** for the grandchild leak — `npx`→node,
  `cursor-agent`→its bundled node runtime survive a pid-only `kill`.
- **Record-keyed orphan sweep** on `close_all()` / boot.

### Phase 3 — `session/list` discovery

`session/list` is universal across the catalog. Surface it as "resume a
conversation this agent already has" — Zed's shipped thread-import feature. Cheap
once Phase 1 exists; it is what makes the reboot story feel designed rather than
degraded. Metadata only (`{ sessionId, cwd, title?, updatedAt? }`); opening one
runs the Phase 1 restore flow.

### Phase 4 — the daemon, deferred

Do not build it now. See §"The trigger to revisit the daemon".

## Alternatives considered

- **Dumb daemon relay + frame buffer.** A daemon holds the pipe and buffers
  frames; the app reattaches. Deferred. It is Phase 1 _plus_ a daemon (a reboot
  kills it, so it still needs the whole resume/journal cold path), the "dumb"
  framing does not survive ACP's bidirectionality (§2.1–2.4 of the eval — a
  relay that must not re-prompt an answered permission is already parsing ids
  both ways), and the one event it uniquely helps (webview reload) is fixed
  in-process by Phase 2 for a fraction of the cost. Full analysis:
  `acp-process-ownership.md` §3(b).
- **Smart ACP-aware daemon (Paseo's model).** The daemon _is_ the ACP client;
  the app gets a derived stream. It genuinely solves the detached-permission
  problem (the daemon holds `pendingPermissions`) and adds multi-device. But it
  is ~3,700 lines of Rust to replace tested TypeScript, moves the whole ACP
  surface behind a stream Silo versions forever, and fits "smallest thing that
  fully works" poorly. Rejected for now; it is the honest answer only if Silo
  commits to `terminal/*` tool calls that must keep running while the app is
  closed. `acp-process-ownership.md` §3(c).
- **Client-only history store, no `resume`/`load`.** The app journals everything
  and never reconnects the agent context. Simpler, no capability probe — but the
  conversation is then read-only for _every_ agent, not just the ones that can't
  reconnect. Kept as the journal-only fallback tier, not the primary path.
- **Persist in dockview `params` (the spike's approach).** Broken round-trip;
  RFC 0041 replaced it.

## Decision

**Accepted 2026-09-09.** Ship RFC 0042's model — app-owned child, durable
`ChatPanelState`, app-side journal — rebased on the current protocol, in-process
frame buffer rather than a daemon, per `acp-process-ownership.md`. Phasing:

- **Phase 1 (ACP sprint Session 4):** `ChatPanelState` restore, the
  `resume → load → journal` flow with `protocolVersion` negotiation,
  `session/close` on clean teardown, the journal writer/reader, the degraded
  state, the ADR.
- **Phase 2:** in-process frame buffer + `acp_attach` + reap-on-unclaimed;
  `renderer: "always"` for the recorded Chat panel; process-group kill;
  orphan sweep.
- **Phase 3:** `session/list` discovery.
- **Phase 4 (deferred):** the daemon — only on a written trigger below.

### The four open questions, resolved

1. **Journal format.** `.jsonl` of `SessionUpdate`, **no on-disk compaction**
   (every agent replays in one shot; window the render like Paseo). A cursor-
   shaped compacted snapshot only if a long session measurably drags — matching
   `replayFrom`'s future shape.
2. **Can the journal-only path send a message?** Yes, but as an explicit
   "Continue in a new session" action that runs `session/new` and appends to the
   **same** journal with a visible divider. Silently stitching two agent
   contexts into one transcript misrepresents what the agent knows.
3. **The ADR — where and what.** `docs/decisions/`, and this RFC's stronger
   wording is correct: **the session resurrects; the process and any in-flight
   turn do not.** With the nuance the sprint plan was reaching for: inside a
   running app a background Chat agent stays alive, and after Phase 2 it also
   survives a webview reload — it does not survive a quit.
4. **Orphaned journals.** Prune on workspace load: any `chat-sessions/*.jsonl`
   with no `DockPanelRecord` referencing it **and** no write in N days. Never
   prune on quit — a crash-orphaned journal is sometimes the only copy of a
   conversation the user still wants.

### The trigger to revisit the daemon

Build it only if one becomes true, and say which in the ADR:

1. **ACP v2's out-of-turn `session/update`s ship and agents adopt them** — an
   unattached client then demonstrably loses agent-initiated work. This is the
   one research finding that genuinely argues for a holder.
2. **Measured evidence** — a count, like the 45→47 measurement — that users run
   long unattended turns and lose them to a quit.
3. Silo commits to `terminal/*` tool calls that must keep running while the app
   is closed — at which point the answer is the smart daemon (c), not the relay.

### Recon still owed

`acp-process-ownership.md` §4.6 items 1–5 ran 2026-09-09 (§5). Restart-fidelity
recon (Session 6, above) closed out **`pi`** — it has no `resume` capability at
all (`session/load` only), which is why an earlier `session/list` probe against
it came back looking unresumable; the catalog should not claim `resume` support
for `pi`. **`codex` remains open** — still no login on the recon machine, so
its restore path (it advertises `resume`, matching `claude`'s shape) is
untested end to end; needs a machine with a real `codex login` session.

### On acceptance

- ADR in `docs/decisions/` — "a Chat agent dies with the app; its session does
  not."
- Roadmap: the Agent Chat panel row moves toward `stable` as phases land.
- Glossary: **Chat session resurrection**, **transcript journal**, **frame log**
  (the in-process raw-frame buffer — distinct from the typed, durable journal),
  **reattach** (now spans terminal and chat), **resume** vs **load** as two
  distinct agent capabilities.

## Related

- [ADR 0052](../decisions/0052-chat-session-resurrection.md) — "a Chat agent
  dies with the app; its session does not" (written on acceptance of Phase 1).
- [`acp-process-ownership.md`](../acp-process-ownership.md) — the evaluation this
  RFC implements, incl. the 2026-09-09 recon (§5) and the daemon analysis.
- RFC 0041 — `DockPanelRecord`; `ChatPanelState` is persisted in its `state`
  (landed).
- RFC 0038 — Agent Sessions; the typed update stream (Session 3.8) is what the
  journal records; `resume(id)` is defined there.
- [`acp-recon.md`](../acp-recon.md) §5d — the replay-vs-recall conflation,
  resolved by content in `acp-process-ownership.md` §5.2.
- [`acp-sprint-plan.md`](../acp-sprint-plan.md) Session 4 — Phase 1 of this RFC.
- ADR 0026 / RFC 0026 / RFC 0036 — the terminal session-host daemon, its
  backpressure, and its replay tagging (the pattern Phase 2's frame buffer
  borrows).
