---
status: accepted
date: 2026-09-21
---

# 0055. Session Discovery: `/resume` lists only same-cwd sessions from the live connection

## Context

[RFC 0042](../proposals/0042-chat-session-resurrection.md) named
`session/list` discovery as its deferred "Phase 3," and
[ADR 0052](./0052-chat-session-resurrection.md) recorded it as "left open, on
purpose." A Chat panel could only ever resume the one `sessionId` it had
already persisted for itself — there was no way to reach a session started
elsewhere, even though ACP's stable v1 `session/list` method exists
specifically to enumerate them, and Silo's host layer already parsed the
`sessionCapabilities.list` flag without ever calling the method it gates.

## Decision

Ship a `/resume` reserved command in the Chat panel (extending the mechanism
[ADR 0054](./0054-reserved-slash-commands.md) established for `/clear`) that
opens a picker of the agent's other sessions, backed by `session/list`, and
reconnects the panel to the one picked via the existing resume/load/journal
restore flow (RFC 0042) — unmodified.

Two scoping choices narrow this from RFC 0042's original sketch:

1. **Live-connection only.** The picker calls `session/list` on the panel's
   own already-connected `AgentSessionHandle`, reusing its live client rather
   than spawning a throwaway process just to enumerate. There is no
   standalone, pre-connect way to browse an agent's sessions.
2. **Same-`cwd` only.** The picker shows, and allows resuming, only sessions
   whose reported `cwd` exactly matches the panel's own current `cwd`. A
   session with no reported `cwd` is excluded — it cannot be confirmed to
   match. The panel always reconnects with the `cwd` it already had; nothing
   about `cwd` handling in the connect path changes.

`/resume`'s reservation differs from `/clear`'s: ADR 0054 admits `clear`
because Silo's own action is a strict _superset_ of what an agent's own
`/clear` does. `/resume` isn't a superset of anything an agent's `/resume`
might do — it needs to open a picker UI, which a forwarded prompt string
cannot do, so it is reserved whenever the agent supports listing at all
(`AgentSessionHandle.canList`), and — unlike `clear` — only _conditionally_:
an agent that does not advertise `session/list` keeps its own `resume`
command, if it has one, untouched.

## Consequences

**Easier:** a Chat panel can reach any session the connected agent still
knows about, not just the one it persisted itself — recovering from a lost
`DockPanelRecord`, a session started from a different panel, or one from a
prior machine. The restore mechanics are entirely reused: no new resume/load
branch, no new journal handling, no new `cwd`-negotiation logic in the
connect path.

**Harder / accepted costs:** a session reached only through `/resume` has no
**transcript journal** on this machine — Silo only journals sessions it has
already seen through some panel of its own. If the agent supports
`session/resume` (no replay) rather than `session/load` for that id, the
resumed panel opens live but starts with an empty transcript, even though the
agent's own context is genuinely continuing. Documented, not fixed, in this
pass — the alternative (preferring `session/load` specifically for a
Session Discovery pick) would grow a second restore path for one entry point,
which this decision explicitly avoids.

**Left open, on purpose:** a keyboard shortcut and a `panel/tab` menu entry
for the picker (both natural follow-ups on the same `requestResume()`
callback), pagination (not shown in `session/list`'s v1 response shape), and
cross-profile discovery.

## Alternatives considered

- **A standalone `ctx.agents.sessions.list(profileId)`** independent of any
  open panel, spawning its own connection to enumerate. Rejected: doubles
  process-spawn cost for a rare action; the live connection already has this.
- **Adopting a picked session's own `cwd`** instead of restricting to
  matching-`cwd` sessions. Rejected — `session/resume`/`session/load` both
  take `cwd` as a wire parameter, and reconnecting under a foreign folder
  risks the agent rejecting the call or misresolving paths inside the very
  conversation being resumed. The same-`cwd` restriction sidesteps that risk
  entirely rather than mitigating it.
- **Caching `session/list` results** across a panel's lifetime. Rejected — no
  wire signal exists for "the list changed," so a cache would go stale
  silently.

## References

- [RFC 0051](../proposals/0051-session-discovery.md) — the design this
  records.
- [RFC 0042](../proposals/0042-chat-session-resurrection.md) — names this as
  Phase 3.
- [ADR 0052](./0052-chat-session-resurrection.md) — "left open, on purpose."
- [ADR 0054](./0054-reserved-slash-commands.md) — the reserved-command
  mechanism this extends.
- [RFC 0046](../proposals/0046-generic-dock-panel-tabs.md) — per-panel
  working folder; considered and not reused, per the same-`cwd` scoping
  above.
