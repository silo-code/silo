---
status: accepted
date: 2026-09-09
---

# 0052. A Chat agent dies with the app; its session does not

## Context

A Terminal session's PTY outlives the app via the session-host daemon: quit
and relaunch, and the tab reattaches to a process that never stopped. A Chat
session had no equivalent. Its agent is an Agent Client Protocol child piped
directly to Silo (RFC 0038) — a plain child process, no daemon — so quitting
the app killed it, and with it the only copy of the conversation. A user who
has learned that terminals come back reasonably expects agents to.

The obvious fix — hold the child in a daemon the way the PTY host does — was
evaluated and rejected (`docs/acp-process-ownership.md`). ACP is bidirectional
RPC: the agent makes requests _of_ the client (`session/request_permission`,
`fs/*`, `terminal/*`) and blocks until answered. A detached daemon has no
responder for the first one, so "the agent keeps working while the app is
closed" — the entire reason to build a daemon — is false for any turn that
asks permission, which is most interesting turns. What a daemon's frame buffer
uniquely helps (a webview reload) is cheaper to fix in-process in `acp.rs`
(RFC 0042 Phase 2) than by standing up a second long-lived process with its
own version-skew, orphan-sweep, and two-platform-impl costs.

Separately, the protocol itself moved since Silo's Chat sessions were
designed: `session/resume` (reconnect without replay) and `session/close`
stabilized, and ACP v2 removes `session/load` entirely in favor of `resume` +
an optional replay cursor. Silo's client knew only `session/load` and
hardcoded `protocolVersion: 1` — stale against the agents it already talks to,
not just against where the protocol is going.

## Decision

**The session resurrects; the process and any in-flight turn do not.**

Concretely (RFC 0042 Phase 1, `docs/proposals/0042-chat-session-resurrection.md`):

- The panel persists `{ sessionId, profileId, cwd }` in its `DockPanelRecord`
  (RFC 0041) — durable, not `$TMPDIR`.
- On restore, `ctx.agents.sessions.connect()` probes `sessionCapabilities.
resume` and `agentCapabilities.loadSession` **separately** and negotiates
  `protocolVersion` rather than hardcoding it. `resume` wins when both are
  advertised (no replay, faster, and the only path ACP v2 keeps).
- The app keeps its own **transcript journal** — a durable, typed
  `.jsonl` of the update stream, independent of the agent — so a restored
  panel paints instantly and a `resume` reconnect (which itself replays
  nothing) or an agent that supports neither capability still has a
  transcript to show.
- `connect()` never refuses to open the panel: a stale or unresumable session
  falls through to a fresh `session/new`, and an agent that can do neither
  degrades to a read-only `"journal-only"` session with an explicit "Continue
  in a new session" action, rather than an error state.
- `session/close` is called on a clean panel close, before killing the
  process, when the agent advertises it.

The precise scope of "resurrects": inside a running app a background Chat
agent already stays alive (true before this change); after RFC 0042 Phase 2's
in-process frame buffer it also survives a webview reload. It never survives a
quit — an in-flight turn and a pending permission prompt outstanding at quit
are both lost, reported as an ended-unknown turn on the next reconnect.

## Consequences

**Easier:** a Chat conversation now behaves like a terminal across an app
restart or a machine reboot — reboot takes the identical code path as restart,
since both leave only durable disk. An agent's own replay fidelity is no
longer load-bearing for a `resume`-capable agent, or for the degraded tier,
because the journal is Silo's own record. Extending resume to more agents as
they adopt `sessionCapabilities.resume` costs nothing further on Silo's side.

**Harder / accepted costs:** every Chat session now carries a second durable
artifact (its journal) that must be pruned (on workspace load, keyed on
DockPanelRecord references and age — never on quit, since a crash-orphaned
journal is sometimes the only surviving copy) and reconciled against
replayed content on the `load` path. An agent that keeps its own session
state in `$TMPDIR` still loses agent-side resumability across a reboot and
falls to journal-only; Silo cannot fix another program's storage choice.

**Left open, on purpose:** the in-process frame buffer (Phase 2, reload
survival), `session/list` discovery (Phase 3), and the daemon (Phase 4,
deferred) are named but not built here.

## Alternatives considered

- **A daemon holding the ACP connection** (dumb relay or Paseo-style smart
  client) — deferred, not rejected outright. See the trigger conditions below.
- **Client-only history, no reconnect at all** — simpler, but makes every
  session read-only after a restart, not just the ones an agent genuinely
  can't reconnect. Kept as the fallback tier, not the primary path.
- **Rebasing on `loadSession` alone** (the design's own earlier draft, before
  the 2026-09-09 recon) — would have sent an agent advertising `resume` but
  not `load` to the degraded tier despite being fully continuable. No such
  agent exists in Silo's catalog today, but the branch order was wrong for
  where the protocol is going; fixed before it shipped.

### The trigger to revisit the daemon

Not a hedge — a written commitment to reconsider only if one of these becomes
true:

1. ACP v2's out-of-turn `session/update`s ship and agents adopt them, so an
   unattached client demonstrably loses agent-initiated work.
2. Measured evidence that users run long unattended turns and lose them to a
   quit — a count, not a hypothesis.
3. Silo decides to provide `terminal/*` tool calls that must keep running
   while the app is closed — at which point the honest answer is a
   Paseo-style smart daemon, not a dumb relay.

## References

- [RFC 0042](../proposals/0042-chat-session-resurrection.md) — the design this
  records, including its phasing and the four resolved open questions.
- [`acp-process-ownership.md`](../acp-process-ownership.md) — the evaluation
  that rejected the daemon and the 2026-09-09 recon backing this decision.
- [ADR 0028](./0028-sealed-agent-detection.md) — sealed detection; this ADR's
  "declared identity" carries the same trust boundary into Chat sessions.
- [ADR 0010](./0010-persistent-process-sessions.md) — the persistent-process
  precedent this ADR explicitly does _not_ extend to Chat sessions, and why.
- [ADR 0050](./0050-replay-is-tagged-not-filtered.md) — the PTY reattach
  replay-tagging pattern RFC 0042 Phase 2's frame buffer borrows.
