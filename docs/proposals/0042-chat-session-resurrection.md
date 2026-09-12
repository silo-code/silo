---
status: draft # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-09-09
---

# 0042. Chat session resurrection — across app restart and machine reboot

## Summary

A Chat session's agent process dies when the app quits. The user expects the
conversation — and the ability to keep talking to it — to come back on the next
launch, the way a terminal's PTY does. The [ACP recon](../acp-recon.md#5d-spike-d--sessionload-restores-a-conversation-across-a-process-death)
proved the mechanism: the agent keeps the transcript on its own side, so a fresh
process can `session/load(sessionId)` and the context replays. This RFC makes
that a real feature: the app persists `{ sessionId, profileId, cwd }` in the
panel's `DockPanelRecord` (RFC 0041), reloads on mount, journals the typed
update stream to disk as a conversation-of-record independent of the agent, and
handles the agents that cannot `loadSession` with an explicit degraded state.
Reboot is the same path as restart. This is **ACP sprint Session 4** work; this
RFC is its design and the ADR it produces.

## Motivation

### Terminals survive restarts; Chat sessions should too

Silo's promise is "all your projects alive at once." A terminal delivers on it
across an app restart via the session-host daemon: the PTY outlives the app, and
the panel reattaches. A Chat session today just vanishes — quit the app, and the
transcript and the agent are both gone. A user who has learned that terminals
come back will reasonably expect agents to.

### The recon already de-risked it

Spike D (`scratchpad/acp-probe/probe-load.mjs`, 2026-09-07) tested the real
thing — plant a fact, `SIGKILL` the agent, respawn, `session/load`, ask for the
fact back:

| Agent               | `loadSession` | replayed on load | recalled the fact |
| ------------------- | ------------- | ---------------- | ----------------- |
| `claude-acp` 0.75.1 | advertised    | 2 updates        | **yes**           |
| `cursor` 2026.09.02 | advertised    | 3 updates        | **yes**           |

Both replay prior turns as `session/update` notifications _before_ answering the
load — the client gets the transcript back for free. This is a **panel-layer
feature**, not a daemon rewrite.

### But the wiring written in the spike does not work

`AcpChatPanelParams` gained `sessionId`, persisted through `api.updateParameters`
into `ws.dockLayout`. On test it came back with an empty transcript — the
params did not carry `sessionId` back on remount. RFC 0041's `DockPanelRecord`
removes the round-trip: the session id is a field on a structured record, not a
value smuggled through dockview's layout serialization.

### `loadSession` is not universal

The [registry matrix](../acp-recon.md) shows `loadSession` widely advertised but
not guaranteed. The model needs a "this session cannot be resurrected by the
agent" state, and — for the conversation to survive regardless — the app's own
transcript journal.

## Design

### What the app persists

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

### The transcript journal — the conversation-of-record

The app appends the **typed update stream** (RFC 0038 Session 3.8 — already
modelled, not raw ACP wire) to a per-session log:

```
<workspace-state-dir>/chat-sessions/<sessionId>.jsonl
```

One entry per `SessionUpdate`. This is the guarantee that the _conversation_
never dies, decoupled from the agent process:

- **Instant display** on panel reopen — render from the journal before
  `session/load` finishes (or instead of it, for agents that can't).
- **The only record** for an agent without `loadSession`.
- **Reboot-safe** — it is on durable disk.

Journals are pruned with their panel record (panel closed → session ended → its
`.jsonl` removed), and by a size/age cap.

### Restore flow, on panel mount

```
record.state.sessionId?
├─ yes → initialize
│        agent.capabilities.loadSession?
│        ├─ yes → session/load(sessionId)
│        │        ├─ ok       → agent replays transcript; panel live, fully resumed
│        │        └─ error    → treat as stale (below)
│        └─ no  → RESUMABLE-BY-JOURNAL-ONLY:
│                 render journal read-only + "Continue in a new session" action
│                 (which does session/new, keeping the same panel + profile)
└─ no / stale → session/new → fresh session, same panel + profile + cwd
                (never refuse to open — a vanished old session must not block the panel)
```

### Reboot

No separate mechanism. A reboot is a harder app restart: the agent process is
definitely gone, `$TMPDIR` may be cleared. The restore flow above already
assumes the process is dead and reads only durable state (the record + the
journal + the agent's own on-disk session store). The two failure modes to
document, not solve:

- **Agent keeps session state in `$TMPDIR`** — `session/load` fails after a
  reboot; falls to the journal-only path. Per-agent; note it in the catalog.
- **Auth expired during downtime** — `session/load` or `session/new` returns
  `auth_required`; the panel shows the existing auth flow.

### The `ctx.agents` surface

`ctx.agents.resume(id)` already exists in the glossary as "reloads a Chat
session's transcript after its process died." This RFC is its implementation.
`AgentInfo` gains a resurrection status so a consumer can render it:

```ts
type ChatResumeState =
  | "live" // process running
  | "resuming" // session/load in flight
  | "resumed" // loaded, live again
  | "journal-only" // agent can't loadSession; transcript shown, not continuable in place
  | "unavailable"; // no sessionId and no journal — nothing to show
```

### Scope for Session 4

- `DockPanelRecord.state` carries `ChatPanelState` (needs RFC 0041 Phase 1).
- The transcript journal writer + reader.
- The restore flow, verified against `claude-acp` and one agent lacking
  `loadSession`.
- Process reaping on panel close / workspace close / app quit / page reload
  (already Session 4 scope — the leak shapes in the sprint plan).
- The ADR below.

## Alternatives considered

- **Daemon-owned ACP children** (the terminal session-host model for agents).
  Keeps the agent _process_ alive across an app restart, so no `session/load`
  replay and an in-flight turn survives. But: does **not** survive a reboot (the
  user's explicit requirement), is the heavy/leak-prone path Session 4 is
  already fighting (45→47 orphaned children on one page reload), and RFC 0038
  scoped it out ("observation parity, not capability parity"). Deferred — a
  possible later phase if "resume a turn that was mid-flight" turns out to
  matter, but resurrection does not need it.
- **Client-only history store, no `session/load`.** The app journals everything
  and never asks the agent to reload. Simpler, no capability probe. But the
  conversation is then _read-only_ — you can see it, not continue it in the same
  agent context — for every agent, not just the ones lacking `loadSession`.
  Rejected as the primary path; kept as the fallback tier.
- **Persist in dockview `params` (the spike's approach).** Already tried,
  already broken (the round-trip bug). RFC 0041 exists partly to replace it.

## Decision

_Draft. Open questions for review:_

1. Journal format — `.jsonl` of `SessionUpdate` as above, or a compacted
   snapshot + tail? Replay cost on reopen of a long session.
2. Does the journal-only path let the user _send_ a message (starting
   `session/new` transparently and stitching the journals), or is it strictly
   read-only with an explicit "new session" action?
3. Where does the ADR live — "agents die with the app, the session does not" —
   and does it supersede the sprint plan's planned Session 4 ADR wording
   ("agents die with the app, and the conversation does not")? This RFC's claim
   is stronger: the _session_ (transcript + ability to continue) resurrects; the
   _process_ and any in-flight turn do not.
4. Prune policy for orphaned journals whose panel record was lost (crash before
   the record persisted).

_On acceptance: ADR in `docs/decisions/`, roadmap row flips the Agent Chat panel
toward `stable`, glossary gains **Chat session resurrection** / **transcript
journal**._

## Related

- RFC 0041 — `DockPanelRecord`; `ChatPanelState` is persisted in its `state`.
- RFC 0038 — Agent Sessions; the typed update stream (Session 3.8) is what the
  journal records; `resume(id)` is defined there.
- [ACP recon §5d](../acp-recon.md#5d-spike-d--sessionload-restores-a-conversation-across-a-process-death)
  — the proof `session/load` survives `SIGKILL`.
- [`acp-sprint-plan.md` Session 4](../acp-sprint-plan.md#session-4--persistence-and-the-proof)
  — the session this RFC designs.
- ADR 0026 / RFC 0026 — the terminal session-host daemon, the model deliberately
  _not_ copied here.
