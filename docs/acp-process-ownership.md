# ACP process ownership and persistence — evaluation

_Research and recommendation feeding [RFC 0042](proposals/0042-chat-session-resurrection.md)
and ACP sprint Session 4. Companion to [`acp-recon.md`](acp-recon.md), which this
document corrects in two places. Written 2026-09-09; §5 adds recon results run
the same day, which strengthen the recommendation._

**Question.** Who owns a Chat agent's process, and what survives a workspace
switch, a webview reload, an app quit + relaunch, and a machine reboot?

**Answer, up front.** Ship RFC 0042's model (app-owned child, durable session
record, app-side journal), but rebase its restore path onto the protocol as it
stands _today_ rather than as the recon found it in July, and take the frame
buffer **in-process in `acp.rs`** rather than in a daemon. That converts the
measured webview-reload leak into reload durability for a few hundred lines of
Rust, gets every hard problem of the daemon candidate except two to vanish, and
leaves the daemon a strictly additive later phase if the trigger conditions
below ever fire. Do not build a daemon now.

---

## 1. Research

### 1.1 The protocol moved, and both RFC 0038 and RFC 0042 are written against a stale snapshot

This is the single most consequential research finding, and it is not about
process ownership at all.

> **Refined by the 2026-09-09 recon (§5.1):** the capabilities below are present
> on _every_ agent in Silo's catalog today — `loadSession` and `session/list`
> universally, `session/resume` on 3 of 5. What is stale is **Silo's client**
> (`acp-jsonrpc.ts` knows only `session/load`, hardcodes `protocolVersion: 1`),
> not the agents. The "resume-not-load agent falls to journal-only" failure has
> zero members in the catalog.

| Fact                                                                                                                                                                         | Status                                                                                   | What Silo currently assumes                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `session/resume` — reconnect to a session **without replaying** history, gated on `sessionCapabilities.resume`                                                               | **Stabilized** (RFD completed 2026-04-22)                                                | Does not exist. `acp-jsonrpc.ts` knows only `session/load`. |
| `session/close` — cancel the session's work and free its resources                                                                                                           | **Stabilized**                                                                           | Not implemented; Silo kills the process instead.            |
| `session/list` — discovery, cursor-paginated `{sessionId, cwd, title?, updatedAt?, additionalDirectories?, _meta?}`                                                          | Stable in v1 as a capability; in v2 **mandatory** for any agent with the session surface | Noted in the prompt as "discovery only"; unimplemented.     |
| **ACP v2 (draft, announced 2026-07-20)** removes `session/load` entirely; `session/resume` plus an optional `replayFrom` cursor covers both no-replay resume and full replay | Draft — v1 supported long-term, implement both side by side                              | Client hardcodes `protocolVersion: 1`, no negotiation.      |
| v2 lets agents **emit `session/update` outside a user-initiated turn**                                                                                                       | Draft                                                                                    | The whole model assumes turn-scoped updates.                |

Two consequences, before any ownership question:

- **`loadSession` is no longer the only resume path, and it is the one going
  away.** RFC 0042's restore flow branches solely on
  `agentCapabilities.loadSession`. An agent that advertises
  `sessionCapabilities.resume` and not `loadSession` — which the RFD exists
  precisely to enable — falls to RFC 0042's "journal-only, read-only" tier even
  though it is fully continuable. That is a correctness bug in the design, not a
  refinement.
- **`replayFrom` is the shape the journal wants.** Today its only variant is
  `{ "type": "start" }` (replay everything, inclusive), with the RFD explicitly
  leaving "room for future replay cursors." A client that keeps its own journal
  and asks the agent only for what it is missing is where v2 is heading. Silo's
  journal is therefore not a workaround for weak agents — it is the client-side
  half of the protocol's own direction.

The v2 out-of-turn-updates change is the one thing in the entire research that
argues _for_ a long-lived holder: if an agent can speak when no turn is running,
a client that is not attached misses it. It is a draft, gated behind version
negotiation, and no agent in Silo's catalog does it yet. It belongs in the
trigger list (§4.4), not in today's decision.

Sources: [session-setup](https://agentclientprotocol.com/protocol/session-setup),
[v2 session-setup](https://agentclientprotocol.com/protocol/v2/session-setup.md),
[session/resume RFD](https://agentclientprotocol.com/rfds/session-resume),
[v2 draft announcement](https://agentclientprotocol.com/announcements/acp-v2-draft),
[v2 session/list](https://agentclientprotocol.com/protocol/v2/session-list.md).

### 1.2 Paseo, read directly (`repos/getpaseo-paseo`)

The prompt's characterization holds. Verified corrections and additions:

- **Scale.** `packages/server/src/server/agent/providers/acp-agent.ts` is
  **3,685 lines**, plus per-vendor subclasses (`cursor-acp-agent.ts`,
  `kiro-`, `kimi-`, `trae-`, `copilot-`, `generic-`). This is the honest price
  tag on "the daemon holds the ACP client."
- **It does not journal transcripts — confirmed.** `agent-storage.ts`'s
  `STORED_AGENT_SCHEMA` has no transcript field (id, provider, cwd, workspaceId,
  timestamps, title, labels, lastStatus, config, `persistence: {provider,
sessionId, nativeHandle?, metadata?}`, attention, archivedAt, owner).
  `agent-timeline-store.ts` is a pure in-memory `{epoch, rows, nextSeq}` with
  cursor-windowed fetch. `persistedHistory` in `acp-agent.ts` is the _catch
  buffer for the agent's own load replay_ (`replayingHistory` gate at line 2308),
  not disk.
- **It already implements the dual path Silo lacks**
  (`initializeResumedSession`, lines 1533–1570): `loadSession` if advertised,
  else `unstable_resumeSession` if `sessionCapabilities.resume`, else throw
  `does not support ACP session resume`. Note the consequence of _not_ having a
  journal: on the resume-without-replay branch, `persistedHistory` stays empty
  and the timeline comes back blank. **Paseo's smart daemon has the same
  empty-transcript failure Zed has, on that branch.** A journal is what fixes it,
  and Paseo does not have one.
- **A per-agent quirk worth stealing:** _"Some ACP providers (e.g. Devin CLI)
  require all three params (sessionId, cwd, mcpServers) to be present in
  `session/load` or `unstable_resumeSession` — even when mcpServers is an empty
  array — and return 'Invalid params' if any are omitted."_ Silo's
  `loadSession()` already sends all three; keep it that way.
- **`pendingPermissions` is an in-memory map on the session object**
  (`acp-agent.ts:1430`), and the daemon outlives every client. That is a real,
  earned capability of the smart-daemon model: a permission prompt survives the
  UI going away and is still answerable when it comes back.

### 1.3 Zed, corrected — they have moved, and their bug list is the map of this decision

The prompt's summary of Zed is out of date in one direction and confirmed in the
other.

- **Shipped:** thread **import** from external agents — _"Zed can import existing
  threads from configured External Agents so they appear in your Thread History…
  Imported threads are archived entries; open one to restore it and continue
  where you left off."_ That is option (d): the agent's own store is the source
  of truth, discovery is `session/list`, the client keeps metadata.
- **Still broken, and instructive:**
  - [#56246](https://github.com/zed-industries/zed/issues/56246) — **Cursor ACP
    threads keep their metadata and lose every message.** The reporter traced it
    to both layers: `~/.cursor/acp-sessions/` does not exist and Cursor's native
    transcripts do not contain ACP-created sessions, and _"the Cursor team
    acknowledged that their ACP server fails to send `session/update`
    notifications with message chunks during `session/load` calls, violating the
    protocol specification."_ Zed's own layer stores metadata only, so there is
    nothing to fall back to.
  - [#51341](https://github.com/zed-industries/zed/issues/51341) — sessions
    returned by `session/list` are not surfaced in history.
  - [#52102](https://github.com/zed-industries/zed/issues/52102) — a stdio ACP
    agent that restarts cannot be reconnected without restarting Zed.
  - [#37074](https://github.com/zed-industries/zed/issues/37074),
    [#38067](https://github.com/zed-industries/zed/issues/38067) — history for
    external agents; native threads never written to the DB.

**#56246 exposes a conflation in the spike — and the 2026-09-09 recon resolves
it (§5.2).** §5d's table proved the agent _recalled the planted number_ after a
`SIGKILL` — the agent restoring **its own context** — which is a different claim
from the agent **replaying the transcript to the client**. The recon tested the
second directly: on `claude`, `cursor`, `opencode` and `pi`, `session/load`
re-sends `agent_message_chunk` with the **literal reply text**. **Cursor
replays message content** on cursor-agent 2026.09 — #56246 is not reproduced, so
it was either fixed or is a Zed-layer bug. Cursor is not a known-suspect case
for Silo. (`codex` stays unverified — no login on the recon machine.)

### 1.4 This failure class is industry-wide, not Silo-specific

- [`pingdotgg/t3code` #2838](https://github.com/pingdotgg/t3code/issues/2838) —
  the OpenCode ACP provider creates a **new** session instead of resuming after
  an app or system restart.
- [`OpenHands` #14260](https://github.com/OpenHands/OpenHands/issues/14260) —
  "conversations cannot be resumed after sandbox restart (session_id is not
  persisted)".
- `openclaw` shipped a fix titled _"recover stale persistent sessions by
  structured resume-required code"_ — i.e. an explicit degraded state, exactly
  the tier RFC 0042 specifies.

Every ACP client that presents a session as persistent and does not keep its own
copy has this bug. RFC 0042's journal is the differentiator, not the overhead.

### 1.5 The precedents, and which are genuinely comparable

| Precedent                                                                                       | Comparable?                        | What it actually teaches                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **tmux / dtach / abduco / Silo's pty-host**                                                     | **Only for process ownership**     | A PTY child never makes a **request of its client**. It writes bytes; nobody has to answer. Every hard problem in §2 comes from ACP being bidirectional RPC. Treating "we already have a detachable-process daemon" as most of the work is the central error in the candidate's cost estimate.                                      |
| **mosh**                                                                                        | Closest true analogue              | Server owns the session; client reattaches via a sequence-numbered state sync. But mosh's state (a screen) is fully derivable from the byte stream. An ACP client's state is not — part of it is _promises the agent is blocked on_. You cannot synthesize an outstanding `session/request_permission` from a transcript.           |
| **LSP**                                                                                         | Instructive by inversion           | Nobody built a detachable language server, because the **client** owns the truth (the documents) and a restarted server re-syncs from scratch. ACP inverts that: the **agent** owns the conversation. The right analogue to "re-sync from scratch" here is `session/resume`, which is why the protocol grew it.                     |
| **MCP Streamable HTTP**                                                                         | **The closest protocol precedent** | MCP solved this exact problem the frame-buffer way: an `EventStore`, per-stream event ids, `Mcp-Session-Id`, and resumption via `Last-Event-ID` replaying "messages that would have been sent after the last event ID… **MUST NOT** replay messages that would have been delivered on a different stream." Validates the mechanism. |
| **MCP issue [#1939](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1939)** | Direct warning                     | _"Define behavior when Last-Event-ID is unresumable (unknown / expired / wrong session)"_ — still open. Any buffer with rotation must define what an unresumable cursor means, visibly, or it silently lies about the transcript.                                                                                                   |

---

## 2. Stress-testing the candidate: where "the daemon is just a byte pipe" breaks

**The root cause of everything below: ACP is bidirectional RPC over the pipe, not
a byte stream.** The agent makes requests _of the client_ and blocks until
answered — `session/request_permission`, `fs/read_text_file`,
`fs/write_text_file`, `terminal/create|output|wait_for_exit|kill|release`, plus
vendor methods (`_auth/status_update`, per recon Finding 2). A PTY child does
none of this.

### 2.1 The killer: with no client attached, the agent hangs

A detached daemon holding a live child has no responder for the first agent→client
request. The options are:

1. **Answer `-32601` to everything while detached.** Kills permissions, so any
   turn that asks for approval fails — for Claude, that is most turns. The
   "keeps working across a restart" promise, which is the _entire_ reason to
   build the daemon, evaporates for exactly the turns worth keeping.
2. **Buffer the request and let the agent block.** Same outcome, expressed as a
   hang instead of an error.
3. **Parse enough to auto-answer.** No longer dumb, and it is now making
   security decisions with no user present.

**There is no dumb option that preserves the promise.** Silo's current
`-32601`-everything posture (`fs/*` and `terminal/*` declined in phase 1) masks
this today, leaving only `session/request_permission` — but declining those
capabilities is explicitly a phase-1 posture RFC 0038 leaves open, and Silo's
detached PTY host is the best reason in the industry to eventually provide
`terminal/*`. The moment it does, the detached daemon is structurally unable to
serve them.

### 2.2 `initialize` predates the attach — and so do the negotiated capabilities

Replaying the `initialize` response is the easy half. The hard half: the agent
believes the `clientCapabilities` sent by whichever app build first initialized
that child. A new app that now offers `fs/read_text_file` attaching to a child
initialized by an old build that declined it will **never be asked** — and ACP
has no renegotiation. Capability skew across an app upgrade is unfixable without
respawning the child. Same for `clientInfo.version` and, in future, the
negotiated ACP `protocolVersion`.

### 2.3 The JSON-RPC id space is per-connection, and the client owns half of it

`acp-jsonrpc.ts` does `let nextId = 0` per client construction. A fresh client
attaching to a child that has already answered ids `0..N` starts reissuing from
`0`. Consequences: an agent correlating loosely can mis-route, and a late
response to an _old_ request resolves the _new_ promise.

The fix contradicts the candidate's own rule. Either the buffer keeps the
**client→agent** direction too (so the new client can seed `nextId` above the
maximum id it sees) — in which case "buffer every child→client frame" is wrong
and it must be a full-duplex log — or the daemon rewrites ids, which is parsing.

### 2.4 A pending `session/request_permission` across a restart: the candidate's best case, and still not free

This genuinely works, and it is the one thing (b) does that (a) cannot: the agent
is alive and blocked, the buffered request replays with its original id, the new
client answers with that id, the agent unblocks.

But the daemon **must not replay a request the previous client already
answered** — a second response to a consumed id is a protocol error and, worse,
re-prompts the user for a decision they already made. So the daemon must track
which inbound request ids have been answered, which means parsing `id` and
matching responses in both directions.

**Conclusion: "dumb" is already false. The honest word is _shallow_** — parse
`id` and `method`, never semantics. Shallow is defensible and should be written
that way in any RFC. Claiming a pure byte pipe would be claiming something the
implementation cannot deliver.

### 2.5 Buffer growth, compaction, and why the PTY ring does not transfer

`pty-host/src/daemon.rs` is `RING_CAP = 256 * 1024`, **in memory, no disk**, with
`T_REPLAY_BEGIN`/`T_REPLAY_END` brackets (RFC 0036). That design works because
terminal scrollback is lossy by nature — dropping the oldest bytes is what a
terminal does.

Dropping the oldest _frames_ silently truncates a conversation, and can evict the
`initialize` response the client structurally requires. An ACP frame log needs:

- a **pinned head** (the `initialize` response, the `session/new` response) that
  compaction never evicts;
- a **durable on-disk log with rotation** — the daemon's whole point is surviving
  an app quit, so an in-memory ring would defeat it;
- a **visible truncation marker**, so the transcript renders "earlier messages
  not available" rather than lying. This is MCP #1939, unsolved upstream.

`daemon.rs` has none of this. Costing (b) as "extend the daemon we already have"
understates it by a subsystem.

### 2.6 Two attachers

The PTY daemon's answer is `MAX_DATA_CLIENTS = 1` with eviction, and it took real
work to stop foreground probes from evicting the live UI client
(`discovery.rs:14`, `session_host.rs:71`). For ACP, eviction is strictly worse:
evicting a client that owes the agent a permission response leaves the agent
blocked forever. (b) should be **one client, refuse — never evict.**

Multi-device is Paseo's product, not Silo's, and it requires (c). Silo ships a
single Tauri window (`tauri.conf.json` declares one; only `get_webview_window
("main")` is used), so "two webviews" is not a case that exists today.

### 2.7 Crash between spawn and the first persisted record

Under (a) this is a lost `sessionId` and a fresh session — annoying, recoverable.
Under (b) it is a **live orphan daemon owning a live agent with no record
pointing at it**, and an orphan sweep cannot distinguish it from a legitimately
detached session. The mitigation inverts RFC 0041: the daemon must write its own
record (handle, profileId, cwd, pid) _before_ spawning the child, making the
daemon the record owner rather than the panel. Name that as a consequence, not a
detail.

### 2.8 Version skew

RFC 0036 already solved this shape: `proto_compatible()` accepts a **range**, and
a daemon forked by the previous release keeps serving its sessions on its own
version for their lifetime. That mechanism transfers directly.

An ACP daemon adds a **second skew axis**: the ACP protocol version and client
capabilities its child was initialized with (§2.2). The daemon must record and
re-announce them at attach so a v2-speaking app knows to speak v1 to that child.
Cheap, but it must be designed in from the start.

Also: it must be built **twice**. `session_host.rs` (Unix socket) and
`session_windows.rs` (Windows, TCP + port files) are two separate
`SessionBackend` impls; any ACP daemon inherits that split.

### 2.9 Is `session/load` on a still-live session well-defined?

**No — the spec is silent.** Neither the schema page nor session-setup addresses
calling `load` on an already-active session, and no agent documents it. Paseo
never does it (it only loads on a freshly spawned process).

Under (b) the case arises in a way it does not under (a): the app attaches to a
_live_ child and must choose between rebuilding from `load` and trusting the
frame buffer. The answer must be **trust the buffer, never load a live
session** — which is fine, and is one of the candidate's genuine advantages, but
it makes the buffer's correctness load-bearing with no protocol fallback behind
it.

### 2.10 The framing that decides it: (b) does not replace (a), it adds to it

A reboot kills the daemon, kills the child, and leaves only durable disk. So (b)
must _also_ implement the whole of (a) — persisted `{sessionId, profileId, cwd}`,
resume/load, the degraded state — as its cold path.

**(b) is (a) plus a daemon.** Every comparison that treats them as alternatives
is comparing the wrong things.

### 2.11 The extension-SDK boundary is unaffected by (a), (b) and the in-process variant, and is materially changed by (c)

Under (a), (b) and (f), the seam stays `ctx.agents.sessions`; replay is invisible
above it — updates simply arrive. RFC 0038's acceptance criterion 2 (a
third-party Chat UI on `@silo-code/sdk` alone) holds identically.

Under (c) the derived event stream becomes the SDK's _only_ vocabulary, and Silo
owns translating every ACP concept forever, versioned as public surface. Paseo's
3,685 lines are what that costs, and under (c) they live inside Silo's public
contract.

---

## 3. The options

Events: **(1)** workspace switch · **(2)** webview reload · **(3)** app quit +
relaunch · **(4)** reboot.

### (a) RFC 0042 as written — ephemeral in-process child + app journal + `session/load` each launch

| Event | Outcome                                                                                                                                                                                                                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Survives fully (already true — the child is app-owned and background workspaces keep theirs).                                                                                                                                                                                                       |
| 2     | **Does not survive, and RFC 0042 does not say so.** The child outlives the reload (that is the 45→47 leak) but the client cannot re-attach: it missed every frame during the gap and cannot re-`initialize`. So a reload must reap + respawn + reload the session: ~5s and the in-flight turn lost. |
| 3     | Conversation resurrects (~5s); process new; in-flight turn lost; a pending permission lost.                                                                                                                                                                                                         |
| 4     | Identical path to 3. This uniformity is the model's real elegance.                                                                                                                                                                                                                                  |

Cost: low, almost all TypeScript — journal writer/reader, restore flow, reaping.
Risk: entirely dependent on per-agent replay fidelity, and Cursor is now a
known-suspect case (§1.3). Compliance: good. SDK fit: unchanged.

### (b) Dumb(-ish) daemon relay + frame buffer — the candidate

| Event | Outcome                                                                                                                                                                                                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Survives.                                                                                                                                                                                                              |
| 2     | **Survives — reattach + replay, no respawn, tens of ms.** The reload leak becomes structurally impossible: the daemon owns the child, the app is a client.                                                             |
| 3     | Process survives; transcript from the buffer; a pending permission is answerable; a turn needing no client interaction completes while the app is gone — but a turn that asks permission while detached blocks (§2.1). |
| 4     | Dies. Falls back to (a)'s path entirely.                                                                                                                                                                               |

Cost: **high.** A new daemon (or a second mode of the existing one) × two
platforms; a durable frame log with rotation, pinned head, and truncation marker;
shallow duplex parsing for id/answered tracking; an attach protocol with two skew
axes; an orphan sweep; **plus all of (a)** for the reboot path.
Risk: §2.1 is a correctness cliff, not a rough edge. Compliance: fine, and the
`session/resume` RFD names this architecture approvingly ("a proxy/adapter that
intercepts the agent's messages and writes them to disk"). SDK fit: unchanged.

### (c) Smart ACP-aware daemon (Paseo's model)

Does everything (b) does, **and solves §2.1** — the daemon _is_ the client, so it
holds `pendingPermissions` and simply answers nothing until a UI attaches, which
is precisely what Paseo does. Adds multi-device. Reboot still dies; still needs
the resume path.

Cost: **very high.** Paseo's ACP client alone is 3,685 lines plus per-vendor
subclasses, in a daemon. For Silo it means rewriting `acp-jsonrpc.ts` (17 KB),
`acp-sessions-service.ts` (23 KB), and `acp-update-model.ts` (6 KB) of tested
TypeScript into Rust, and moving the whole ACP surface behind a derived stream
Silo must version forever (§2.11). Fit with the positioning is excellent; fit
with "smallest thing that fully works" and with a small stable core is poor.

### (d) Agent-store-first — `session/list` + `session/resume(replayFrom)`, minimal Silo state

Zed's shipped answer (thread import) and where the protocol is going (v2 collapses
`load` into `resume` + `replayFrom`).

Events 1–2: no better than (a). Events 3–4: identical path, which is the point —
reboot stops being a special case at all.

Cost: **lowest** — it is (a) minus the journal, plus a capability probe and a
discovery surface. Risk: it is exactly as good as the agent's store, and the
evidence says that is uneven (Cursor per Zed #56246; OpenCode per t3code #2838;
`loadSession` not universal; `$TMPDIR`-backed agents). And it gives Silo nothing
to render for an agent that resumes _without_ replay — the capability the protocol
just stabilized. **(d) alone under-delivers, but it is the right frame for the
cold path, and its discovery half is worth having on its own.**

### (e) Hold-on-quit hybrid — dumb normally, held only across a quit

Rejected, and the reason is worth recording: the moment the holder must answer a
request it is (c); the moment it need not, the child could as well have been
killed — a detached agent that cannot be asked for permission and whose output you
are only buffering is doing nothing you could not get from `resume`. It wins in
exactly one case: a long tool-running turn needing no approvals. Not worth a
daemon.

### (f) **In-process frame buffer + reattach in `acp.rs` — no daemon** _(the option the framing hid)_

Silo **already has daemon-like durability across a webview reload**: the Rust host
owns the children and they survive the reload. The 45→47 measurement is the
proof — the children are alive; only the client is gone. What is missing is a
buffer and a reattach path, not a process owner.

So: keep the connection registry in `acp.rs`, add to each connection a **bounded
in-memory frame log** with a pinned head (`initialize` and `session/new`
responses) and a truncation marker; add `acp_attach(connectionId)` which replays
the log and then streams live, bracketed the way RFC 0036 brackets PTY replay;
persist `connectionId` alongside `sessionId` in the panel's `DockPanelRecord`;
and reap any connection that is unclaimed N seconds after a page load.

| Event | Outcome                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------- |
| 1     | Survives.                                                                                           |
| 2     | **Survives — reattach + replay, no respawn.** And the leak becomes a reap-on-unclaimed, i.e. fixed. |
| 3     | Dies → (a)'s path.                                                                                  |
| 4     | Dies → (a)'s path.                                                                                  |

**Every hard problem of (b) except two disappears when the buffer lives
in-process:** version skew is gone (same binary, same build); crash-before-record
is gone (an app crash kills the child); two-attachers is gone (one webview);
disk compaction and rotation are gone (in-memory is sufficient, because app
death is the boundary anyway); the second platform impl is gone. What remains is
the id-space seeding (§2.3) and the pinned head (§2.5) — both of which any
version of this needs, and both of which are cheap.

Cost: a few hundred lines of Rust in a file that already exists, plus a reattach
path in `acp-transport.ts`/`acp-sessions-service.ts`. It is also a **strict
stepping stone**: the frame log, the bracketed replay, the id seeding and the
answered-id tracking are the same code (b) would need, so if the daemon ever
becomes justified, only process ownership moves.

---

## 4. Recommendation

### 4.1 Ship (a) + (f), modernized by (d). Defer (b). Reject (c) and (e).

**Phase 1 — Session 4, rebased on the current protocol.** Ship RFC 0042's durable
state and restore flow, with the restore path **`resume` → `load` → journal**
rather than `load` → journal:

```
record.state.sessionId?
├─ no  → session/new
└─ yes → initialize (negotiate protocolVersion, don't hardcode 1)
         ├─ sessionCapabilities.resume  → session/resume        → render from the journal
         │                                                        (fast; no replay; the v2 future)
         ├─ agentCapabilities.loadSession → paint the journal immediately,
         │                                  session/load, reconcile the replay against it
         └─ neither / error             → journal-only, read-only + "Continue in a new session"
```

Probe `sessionCapabilities.resume` and `agentCapabilities.loadSession`
**separately**. Keep the journal — RFC 0042 is right about it, and Zed #56246 is
the proof: the client that trusts the agent's replay ships an empty transcript
the moment an agent lies about `loadSession`.

**Phase 2 — (f), and the leaks.** Add the in-process frame buffer + reattach, and
with it reap-on-unclaimed. Separately: **process-group kill** for the grandchild
leak (`npx`→node, `cursor-agent`→bundled node), and a record-keyed orphan sweep.
This is where the measured pain actually is.

**Phase 3 — (d)'s discovery half, only if wanted.** `session/list` as "resume a
conversation this agent already has," which is Zed's import feature. Cheap once
Phase 1 exists, and it is what makes the reboot story feel designed rather than
degraded.

**Phase 4 — deferred: (b).** Do not build it now. Revisit only on a written
trigger (§4.4).

### 4.2 Why this and not the candidate

1. **(b) is (a) plus a daemon** (§2.10). Nothing about building (b) lets you skip
   the work of (a), so the question is only whether the daemon's marginal
   durability is worth its marginal cost.
2. **The daemon's headline promise does not survive contact with ACP's
   bidirectionality** (§2.1). "The agent keeps working while the app is closed"
   is false for any turn that asks permission, which is most interesting turns.
   What remains is "the process is still warm and the transcript replays" — and
   (f) delivers the transcript replay for the event that actually happens
   (reload), while `resume` delivers it for the events that don't need warmth.
3. **"Dumb" is not achievable** (§2.4). A relay that must not re-prompt for an
   answered permission is already parsing ids in both directions. The candidate's
   central simplification is not available.
4. **The PTY analogy is weaker than it looks** (§1.5, §2.5). A PTY child never
   asks its client anything, and the existing ring is in-memory with lossy
   semantics. Extending it is a rewrite with a shared vocabulary, not a reuse.
5. **The measured problem is the reload, and (f) fixes it in `acp.rs`.** 45→47
   children across one reload, zero `disposed.` lines, ~23 stale pairs
   accumulated on the dev machine. No daemon is required to fix that.
6. **The protocol is moving toward the client keeping its own copy** (`replayFrom`
   cursors, `session/resume` without replay). Investing in the journal is
   investing with the grain; investing in a process holder is investing against
   a reboot you cannot win anyway.

### 4.3 Failure modes this accepts, explicitly

- An **in-flight turn dies on app quit and on reboot.** A restarted panel shows
  "ended, result unknown"; the next `session/update` or stop reason re-syncs.
- A **permission prompt outstanding at quit is lost**, and the turn it gated is
  reported as ended-unknown.
- An agent that keeps session state in `$TMPDIR` **loses resumability across a
  reboot** and falls to journal-only. The 2026-09-09 recon found **none** among
  the agents tested (claude uses `~/.claude/projects`; cursor and opencode keep
  durable stores) — but `pi` may not persist across processes at all, and
  `codex` is unverified. Record per-agent in the catalog with a `lastVerified`
  date.
- An agent that advertises `loadSession` and replays **nothing** yields a
  journal-only transcript that cannot be continued in place. The recon found no
  such agent (all four tested replay full content), but the journal is what
  keeps a future regression, or an unverified agent, from being a blank panel.
- **Auth expiring during downtime** surfaces as `auth_required` on resume; the
  existing auth flow handles it.
- Until Phase 2 lands, a **webview reload costs a respawn**.

### 4.4 The trigger to revisit (b), written down now

Build the daemon only if one of these becomes true, and say so in the ADR:

1. **ACP v2's out-of-turn `session/update`s ship and agents adopt them**, so an
   unattached client demonstrably loses agent-initiated work. This is the one
   research finding that genuinely argues for a holder.
2. **Measured evidence** that users run long unattended turns and lose them to a
   quit — not a hypothesis; a count, like the 45→47 measurement.
3. Silo decides to provide `terminal/*` **and** wants those tool calls to keep
   running while the app is closed — at which point the honest answer is (c), not
   (b), and the cost is Paseo-shaped.

### 4.5 Cost against this codebase

| Work                                                                                               | Where                                                                                             | Size                    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------- |
| `resume`/`load` capability split, `protocolVersion` negotiation, `session/close` on clean teardown | `agents/acp-jsonrpc.ts`                                                                           | small                   |
| Restore flow + degraded states                                                                     | `agents/acp-sessions-service.ts`, `extensions-core/src/acp-chat/`                                 | medium                  |
| Journal writer/reader over the typed update stream                                                 | new, beside `agents/acp-update-model.ts`; `<workspace-state-dir>/chat-sessions/<sessionId>.jsonl` | medium                  |
| `ChatPanelState` in `DockPanelRecord.state`                                                        | RFC 0041 Phase 1 (landed)                                                                         | small                   |
| **(f)** frame log + pinned head + `acp_attach` + bracketed replay + reap-on-unclaimed              | `src-tauri/src/commands/acp.rs` (546 lines today)                                                 | ~300 lines Rust + tests |
| Reattach path, `nextId` seeding from replayed ids, answered-id tracking                            | `agents/acp-transport.ts`, `agents/acp-jsonrpc.ts`                                                | small–medium            |
| Process-group kill; record-keyed orphan sweep                                                      | `acp.rs`, `close_all()`                                                                           | small                   |
| _(deferred)_ daemon, ×2 platforms, durable log, rotation, skew negotiation                         | new crate + `session_host.rs` + `session_windows.rs`                                              | **large**               |

### 4.6 Recon to run before committing

**Run 2026-09-09 — results in §5. Net: the recon strengthens the
recommendation.** The one finding that could have invalidated Phase 1 (agents
not replaying transcript content on `session/load`) did not materialise — 4 of
4 testable agents replay full message content. Details and the corrections it
forces to §1.1 / §1.3 / §4.3 are below.

1. **Re-run Spike D asserting _replay_, not recall.** Per agent, count
   `session/update` notifications during `session/load` and assert their
   **content** reproduces the prior transcript. Cursor specifically, against Zed
   #56246. §5d currently proves the agent remembers, which is a different claim.
2. **Probe `sessionCapabilities.resume`, `session.list`, `session/close`** across
   all eight catalog agents. All three stabilized _after_ the recon ran; the
   catalog has no field for any of them.
3. **Probe `$TMPDIR` dependence** — plant a fact, reboot (or clear `$TMPDIR`),
   resume. RFC 0042 asserts the reboot story; it is currently an assumption.
4. **Probe `session/load` / `session/resume` against a still-live session** —
   undefined in the spec (§2.9). Only (b)/(f) need the answer, but it is cheap to
   learn and it tells you whether a reattach can safely fall back to `load`.
5. **Re-check the pinned adapter.** Silo pins `claude-agent-acp` 0.75.1 and
   hardcodes `protocolVersion: 1`; Paseo runs `@agentclientprotocol/sdk ^0.17.1`
   with `unstable_resumeSession` already wired. Confirm what 0.75.1 advertises
   today before designing the capability branch around it.

### 4.7 Answers to RFC 0042's open questions

1. **Journal format** — `.jsonl` of `SessionUpdate` is right. **Ship without
   on-disk compaction** — every catalog agent replays the whole transcript on
   `load` in one shot (§5), and Paseo, the only comparable that windows a long
   session, does it in the UI, not on disk. Window the render (mount recent N,
   "load older" on demand). Add a compacted snapshot only if a real session
   measurably drags on reopen; design that boundary as a **cursor** when it
   comes, because that is the shape `replayFrom` will take.
2. **Can the journal-only path send?** Yes — but as an explicit "Continue in a new
   session" action that starts `session/new` and appends to the _same_ journal
   with a visible divider. Silently stitching two agent contexts into one
   transcript would misrepresent what the agent knows.
3. **Where the ADR lives / what it claims** — `docs/decisions/`, and RFC 0042's
   stronger wording is the correct one: _the session resurrects; the process and
   any in-flight turn do not_. Add the sentence the sprint plan's version was
   reaching for: inside a running app a background Chat agent does stay alive, and
   after Phase 2 it also survives a webview reload; it does not survive a quit.
4. **Orphaned journals** — prune on workspace load: any `chat-sessions/*.jsonl`
   with no `DockPanelRecord` referencing it and no write in N days. Do not prune
   on quit; a crash-orphaned journal is sometimes the only copy of a conversation
   the user still wants.

### 4.8 Domain language this produces

New or sharpened terms for `docs/domain-language.md`: **Chat session
resurrection**, **transcript journal**, **frame log** (the in-process buffer of
raw JSON-RPC frames — distinct from the journal, which is typed and durable),
**reattach** (already used for terminals; now spans both session kinds), and
**resume** vs **load** as two distinct agent capabilities rather than one.

---

## 5. Recon results — 2026-09-09

Probe script: initialize + full capability dump, `session/new`, `session/list`,
`session/close`, `session/load` on a still-live session, then Spike D asserting
**replay content** (plant a passphrase → `SIGKILL` → respawn → `session/load` →
count and read the `session/update`s → ask for the passphrase back). Run against
the real login for `claude` and `cursor`; `opencode` and `pi` against their
machine state; `codex` has no login here so only `initialize` ran.

### 5.1 Capabilities — the gap is in Silo's client, not the agents

| agent (version)         | `loadSession` | `sessionCapabilities.resume` | `.list` | `.close` | `session/close` call |
| ----------------------- | ------------- | ---------------------------- | ------- | -------- | -------------------- |
| claude-agent-acp 0.75.1 | ✅            | ✅                           | ✅      | ✅       | OK (`{}`)            |
| cursor 2026.09          | ✅            | —                            | ✅      | —        | `-32601`             |
| opencode 1.18.20        | ✅            | ✅                           | ✅      | ✅       | OK                   |
| codex-acp 1.10.0        | ✅            | ✅                           | ✅      | ✅       | (login required)     |
| pi-acp 0.0.33           | ✅            | —                            | ✅      | —        | `-32601`             |

- **`loadSession` and `session/list` are universal** across the catalog — not
  "widely advertised but not guaranteed." `session/resume` is 3 of 5; `close` as
  a real method is 3 of 5.
- **This corrects §1.1.** The capabilities RFC 0042 is "written against a stale
  snapshot" for are present on every agent _today_; what is stale is
  `acp-jsonrpc.ts`, which only knows `session/load` and hardcodes
  `protocolVersion: 1`. The feared class — "an agent that advertises `resume` and
  not `loadSession` falls to journal-only despite being continuable" — **has zero
  members in the catalog.** `load` is the workhorse; `resume` is a
  skip-the-replay optimisation, not a lifeline.
- `claude-agent-acp@latest` resolves to **0.75.1** — the pin is current
  (§4.6 item 5). Every agent accepts `initialize` with `protocolVersion: 2` and
  **negotiates down to 1**, so bumping Silo's request to 2 is a safe no-op until
  agents speak it.

### 5.2 Spike D — transcript replay **content**, per agent

| agent    | updates on load                                                   | full message text replayed | passphrase in replay | recalled it |
| -------- | ----------------------------------------------------------------- | -------------------------- | -------------------- | ----------- |
| claude   | `user_message_chunk`, `agent_message_chunk`, `available_commands` | **yes**                    | yes                  | yes         |
| cursor   | + `agent_thought_chunk` (4 total)                                 | **yes**                    | yes                  | yes         |
| opencode | `user_message_chunk`, `agent_message_chunk`, `available_commands` | **yes**                    | yes                  | yes         |
| pi       | `user_message_chunk`, `agent_message_chunk`, `available_commands` | **yes**                    | yes                  | yes         |

- **This corrects §1.3 and confirms `acp-recon.md` §5d by content.** §5d proved
  the agent _remembered_; this proves the agent _re-sends the conversation to the
  client_ — `agent_message_chunk` carried the literal reply text
  ("Got it — BANANA-4291-KIWI…") on all four.
- **Cursor replays message content.** Zed #56246's "Cursor's ACP server sends no
  message chunks on `session/load`" is **not reproduced** on cursor-agent
  2026.09 — either it was fixed, or the Zed bug is in Zed's own layer. Cursor is
  not a known-suspect case for Silo.
- Every agent also emits `available_commands_update` on load (RFC 0040 territory
  — the command palette rehydrates for free).
- **`codex` unverified** for replay (no login on this machine) — keep the
  `lastVerified` gap in the catalog and re-run when a codex login exists.

### 5.3 `session/load` on a still-live session — non-fatal everywhere

Called `load` on a session whose process was **still running**:

| agent    | result                                                        |
| -------- | ------------------------------------------------------------- |
| claude   | OK — returns a **new `sessionId`** (behaves like a fork)      |
| cursor   | OK — returns `{ modes, models, configOptions }`, same session |
| opencode | OK — returns `{ configOptions }`                              |
| pi       | OK — returns `{ configOptions }`                              |

The spec is still silent (§2.9), but empirically no agent errors. A reattach
path (f) can therefore fall back to `load` even when unsure the child is dead —
with the caveat that on claude it yields a fresh id, so the frame buffer, not
`load`, must be the reattach primitive for a session known to be live.

### 5.4 Session store location — no `$TMPDIR` dependence found

- **claude:** `~/.claude/projects/<cwd-slug>/<sessionId>.jsonl` — durable,
  survives a reboot. Corrects §4.3's "an agent that keeps state in `$TMPDIR`"
  worry: no such agent among those tested.
- **cursor / opencode:** `session/list` returned real historical sessions with
  real repo cwds → both keep a durable store outside `$TMPDIR`.
- **pi:** `session/list` returned `[]` immediately after creating a session —
  pi may not persist across processes, or persists per-cwd; treat pi resume as
  **unverified** and note it in the catalog.
- **codex:** unverified (no login).

### 5.5 What the recon did **not** touch

§2.1 — a detached daemon having no responder for `session/request_permission` —
is an argument about architecture, not agent behaviour, and stands unchanged. It
remains the reason (b)/(c) are deferred/rejected.

---

## Related

- [RFC 0042](proposals/0042-chat-session-resurrection.md) — the design this evaluates.
- [RFC 0038](proposals/0038-acp-agent-sessions.md) §"Restart" — the deferral this re-examines.
- [RFC 0010](proposals/0010-pty-host-daemon.md) / [RFC 0026](proposals/0026-terminal-session-host-backpressure.md) / [RFC 0036](proposals/0036-replay-tagged-reattach.md) — the PTY daemon, its backpressure, and its replay tagging.
- [RFC 0041](proposals/0041-dock-panel-record.md) — where `ChatPanelState` is persisted.
- [`acp-recon.md`](acp-recon.md) §5d — the replay-vs-recall conflation, resolved
  by content in §5.2; capability table updated in §5.1.
- [`acp-sprint-plan.md`](acp-sprint-plan.md) Session 4 — the session this scopes.
