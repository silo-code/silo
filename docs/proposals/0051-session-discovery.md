---
status: implemented # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-09-21
---

# 0051. Session Discovery — a `/resume` picker for the Chat panel

## Summary

Implements [RFC 0042](./0042-chat-session-resurrection.md)'s deferred "Phase
3: `session/list` discovery." Inside an already-open, connected Chat panel, a
reserved `/resume` command opens a picker of the agent's **other** sessions —
sourced from ACP's stable v1 `session/list` method — scoped to the panel's
current working directory. Picking one reconnects the panel to it through the
same resume/load/journal restore flow RFC 0042 already built.

## Motivation

RFC 0042 named this gap and explicitly deferred it rather than building it:

> Phase 3: `session/list` discovery.

ADR 0052, written on RFC 0042's acceptance, says the same thing more plainly:

> **Left open, on purpose:** [...] `session/list` discovery (Phase 3) [...]
> are named but not built here.

Today a Chat panel can only resume the single `sessionId` it persisted for
itself (`ChatPanelState`, RFC 0041) — there is no way to reach a session
started from a different panel, a different machine, or a panel whose
`DockPanelRecord` was lost. `session/list` is exactly the metadata RFC 0042
sketched needing: `{ sessionId, cwd?, title?, updatedAt? }`. Silo's ACP host
layer already parses the `sessionCapabilities.list` flag
(`acp-jsonrpc.ts`'s `AcpSessionCapabilities`) but has never called the method.
This closes a named, scoped, already-anticipated gap rather than opening new
scope.

## Design

### Protocol facts

`session/list` is stable in ACP v1, gated by `sessionCapabilities.list` on the
`initialize` response — a sibling of `.resume`/`.close`, which Silo already
reads via the existing `capabilityEnabled()` helper (both the bare-boolean and
details-object wire shapes). Confirmed live against `claude-agent-acp`
0.75.1, the same adapter Silo already targets for `.resume`, advertising
`sessionCapabilities: { resume: {}, close: {}, list: {} }`. (The in-progress
v2 schema, still alpha, folds `session/list` into a required baseline method
once an agent advertises `capabilities.session` at all — informational only,
not a constraint on this design.)

### What ships, by layer

- **Wire layer** (`acp-jsonrpc.ts`): `AcpSessionInfo` (the raw `SessionInfo`
  shape) and a defensive `parseSessionInfos()`, plus `AcpClient.listSessions()`
  calling `session/list` through the existing generic `request()` helper —
  the same shape as every other method here.
- **Host service** (`acp-sessions-service.ts`): `canListCap`, read at the same
  site as the existing `canResumeCap`/`canCloseCap`, and a `listSessions()`
  closure on the `AgentSessionHandle` that reuses the session's own live
  `client` reference (the same mutable binding `prompt`/`cancel` close over) —
  **not** a throwaway probe connection spawned just to list. Rejects when the
  agent doesn't advertise `list`, or when the handle is journal-only (no live
  connection to ask).
- **SDK** (`packages/sdk/src/agents-service.ts`): a new public
  `AgentSessionSummary` type (`{ sessionId, cwd?, title?, updatedAt?, raw }`)
  and two new `AgentSessionHandle` members, `canList: boolean` and
  `listSessions(): Promise<readonly AgentSessionSummary[]>` — mirroring
  `canResume`'s existing shape exactly.
- **Chat panel** (`packages/extensions-silo/src/agents-chat-panel/`):
  - `session-restore.ts` gains a `RestartIntent` variant, `"resume-other"` —
    a plain resume (`{ sessionId }`, no `startFresh`), spelled out explicitly
    rather than left to the existing fallback.
  - `command-palette.ts` gains a second reserved command, `RESERVED_RESUME`,
    alongside the existing `RESERVED_CLEAR` (ADR 0054). Unlike `clear`, it is
    **conditional**: only substituted or appended when the connected
    session's `canList` is true. `reservedCommandForDraft()` generalizes the
    old `isReservedDraft()` to report which reserved command (if either)
    a draft is.
  - `composer-model.ts`'s `composerSubmitAction` gains a `"resume-picker"`
    outcome with the same precedence `"reset"` already has: a reserved
    command outranks the send guard (not subject to `busy`/`ready`/`lost`).
  - A new pure module, `resume-session-picker.ts`, holds the picker's
    filtering/display logic (`resumableSessions`, `filterSessionSummaries`,
    `sessionSummaryTitle`, `relativeUpdatedAt`) — kept out of the dialog
    component so it is unit-tested independent of the `List` it drives, the
    same split `command-palette.ts` makes for the `/` palette proper.
  - A new `ResumeSessionDialog.tsx`, modeled on `git-explorer`'s
    `BranchManager` (async-load a list, filter with `SearchInput`, render
    `List`/`ListRow` rows, settle the host modal on `onSelect`) and wired the
    same way `ClearSessionDialog` is: a `requestResume()` callback opens it
    via `ctx.ui.showModal`, and a pick sets `restartIntentRef.current =
{ intent: "resume-other", sessionId }` then bumps `nonce` — the identical
    mechanism "Continue in a new session" already uses.

### Scope: same-cwd only, live-connection only

Two scoping decisions, made deliberately narrower than RFC 0042's own sketch,
both because the narrower version is materially simpler and safer, not as a
placeholder for a later expansion:

1. **The picker only works from an already-open, connected Chat panel** — it
   lists whatever the _live_ connection reports. There is no standalone way to
   browse an agent's sessions before connecting. Avoids spawning a throwaway
   agent process purely to enumerate, and matches the natural entry point (a
   user already talking to an agent, wanting a different conversation with
   the same one).
2. **Only sessions whose reported `cwd` matches the panel's own `cwd`** are
   shown or resumable. A session with no reported `cwd` is excluded too — it
   cannot be confirmed to match. This sidesteps the alternative this proposal
   considered and rejected — adopting a picked session's own, possibly
   different, `cwd` — entirely: `session/resume`/`session/load` both take
   `cwd` as a wire parameter, and reconnecting a foreign session under the
   wrong folder risks the agent rejecting the call or misresolving relative
   paths inside the conversation being resumed. Restricting to matching-`cwd`
   sessions means the panel always connects with the `cwd` it already has,
   with **no new cwd-handling code** anywhere in the connect path.

### A `/resume`-picked session can start with an empty transcript

Silo's own **transcript journal** (RFC 0042) is keyed on a `sessionId` Silo
has already seen through some panel of its own. A session surfaced only
through `session/list` — one Silo has never journaled — has no journal file to
seed the restored panel's transcript from. If the agent supports only
`session/resume` (no replay) for that id, the panel opens live but starts with
an empty transcript, even though the agent's own context is genuinely
continuing. This is a known, accepted consequence, not a bug: RFC 0042 Phase
3's own scope note says "opening one runs the [Phase 1] restore flow"
unmodified, and this proposal does exactly that rather than special-casing
`tryResumeOrLoad`'s existing resume-preferred order to chase full history for
this one path.

## Alternatives considered

- **A standalone `ctx.agents.sessions.list(profileId)` that spawns its own
  connection just to enumerate**, independent of any open panel. Rejected:
  doubles process-spawn cost for a rare action, and drifts from "the live
  connection already has this" — the host-side `listSessions()` closure reuses
  the session's own client rather than opening a second one.
- **Adopting a picked session's own `cwd`** rather than restricting the list
  to matching-`cwd` sessions. Rejected in favor of the narrower scope above —
  see "Scope."
- **Caching `session/list` results across a panel's lifetime.** Rejected for
  this pass: nothing on the wire signals "the agent's session list changed,"
  so a cache would go stale silently. Each `/resume` invocation is a fresh
  round trip.
- **Preferring `session/load` over `session/resume` specifically for a
  Session Discovery pick**, to guarantee history. Rejected — see "A
  `/resume`-picked session can start with an empty transcript" above; this
  reuses the existing restore flow unmodified rather than growing a second
  one.

**Deliberately out of scope for this pass:** a keyboard shortcut and a
`panel/tab` context-menu entry (RFC 0046) for opening the picker — the ask
here is specifically the `/resume` slash command, and a menu/shortcut entry
point is a natural follow-up using the exact same `requestResume()`. Also out
of scope: pagination (`session/list`'s v1 shape shows no cursor) and
cross-profile discovery (only the connected agent's own sessions).

## Decision

**Accepted 2026-09-21.** Ship as designed above, in one phase (no planning
package — this is not multi-stage): the wire/host/SDK layer first as an
independently testable slice, then the panel plumbing (`RestartIntent`,
`composerSubmitAction`), then the reserved command and dialog. See
[ADR 0055](../decisions/0055-session-discovery.md) for the recorded decision.

## Related

- [RFC 0042](./0042-chat-session-resurrection.md) — names and defers this as
  Phase 3; this proposal implements it.
- [ADR 0052](../decisions/0052-chat-session-resurrection.md) — "left open, on
  purpose."
- [RFC 0046](./0046-generic-dock-panel-tabs.md) — per-panel working folder;
  precedent for a panel's own `cwd`, though this proposal's same-cwd
  restriction means it is not reused here.
- [RFC 0048](./0048-clear-as-session-reset.md) / [ADR
  0054](../decisions/0054-reserved-slash-commands.md) — the reserved-command
  mechanism `/resume` extends, and the precedent for a reserved command
  outranking the send guard.
- [`docs/domain-language.md`](../domain-language.md) — adds **Session
  Discovery**.
