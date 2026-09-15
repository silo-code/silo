---
status: accepted
created: 2026-09-15
---

# 0048. Clear is a session reset

## Summary

"Clear" in a Chat panel should mean one thing everywhere: **end the current
session, start a new one, and discard the previous session's transcript
journal.** Today the panel has a "Clear" context-menu item and a ⌘K binding
that only blank the React transcript, while the agent keeps its full context
and the journal keeps every line — so reopening the panel brings the whole
conversation back. Separately, agents advertise their own `/clear` (claude
does) which drops the agent's context but leaves Silo's journal untouched.
Three gestures, three different outcomes, none of them what the user asked
for.

This proposes a single host-side **session reset** behind all three entry
points (⌘K, the tab/transcript context menu, and a typed `/clear`), reached
through a new `transcript` field on the resume options `connect()` already
takes, plus a small **host-reserved slash command** rule so `/clear` means the
same thing regardless of which agent is on the other end.

## Motivation

**The current "Clear" doesn't clear anything durable.** `onClear` calls
`setTranscript(emptyTranscript)` and stops. The transcript journal
(`<workspace-state-dir>/chat-sessions/<sessionId>.jsonl`, RFC 0042) is
untouched, so the next restore paints every turn back. The agent is untouched
too, so it still answers as if the conversation happened. The only thing that
changed is what the user can see — which is the one thing they were least
confused about.

**The in-flight fix reaches for the wrong mechanism.** An unstaged change adds
`ctx.agents.sessions.clearJournal(sessionId)` and unlinks the file. That
cannot work as written: `journalWriter` is closure-local inside `connect()`
and holds every line of the session in memory, because a flush is a whole-file
rewrite (there is no `fs_append_text`). A service-level unlink has no way to
reach that writer, so the next `append` — any `session/update` at all — writes
the entire transcript straight back. The clear only appears to stick if
nothing arrives before disposal. That is the tell that clearing is a
**session-lifecycle** operation, not a file operation.

**The terminal analogy breaks on the agents that need it most.** ⌘K in a
terminal clears scrollback and the shell is unaffected. Here the journal is
described in its own module doc as "the only record for a `session/resume`
reconnect (no replay) or an agent that can do neither `resume` nor `load`."
For a `session/load` agent the journal really is a cache and deleting it is
harmless — the agent replays it back. For a `resume`-only or `journal-only`
session it is the sole copy. The same keystroke is a no-op for some agents and
permanent deletion for others, which is not a contract anyone can reason
about.

**`/clear` already collides.** Silo hardcodes no commands; the palette is
populated purely from the agent's `available_commands_update` (RFC 0040). The
panel already knows claude's `/clear` fires — `scroll.ts` and `AcpChatPanel`
both cite "a `/clear`" as a reason the transcript comes back shorter than it
was saved at — and does nothing about the journal underneath it.

## Design

### The one action

**Session reset**: dispose the current session, `session/new`, discard the
prior journal, repaint empty. ACP has no protocol-level clear — the recon's
probe totals cover `session/list`, `session/set_model`, `session/resume`,
`session/fork`, `session/stop` and nothing else — so `session/new` _is_ the
reset, and Silo's version is a strict superset of any agent's `/clear`: fresh
agent context **and** a fresh journal.

### SDK: one field, not a new method

`AgentSessionConnectOptions.resume` already carries `startFresh`. Add how the
prior transcript is treated:

```ts
resume?: {
  sessionId: string;
  startFresh?: boolean;
  /** What becomes of the prior session's transcript journal when
   *  `startFresh` skips straight to `session/new`. Defaults to `"carry"`. */
  transcript?: "carry" | "discard";
};
```

This is deliberately **not** a reversal of RFC 0042 open question 2. That
question was about the _journal-only recovery_ path — the agent cannot resume,
so "Continue in a new session" carries the conversation forward under the new
id rather than losing it. That remains the default and stays correct. A
user-requested clear is the opposite intent on the same mechanism, so it
belongs as a second value on that axis rather than as a separate API.

Doing it inside `connect()` also fixes the writer problem for free: the
discard happens exactly where the writer is created, so there is no stale
in-memory buffer left to resurrect the file. **`clearJournal` is not added** —
no new public method, and the one optional field rides an interface
extensions already use.

### Host: the service must own its live writers

The remaining hazard is a race, not a design gap. The panel's effect teardown
fires `void writer.flush()` and nobody awaits it, so a reconnect that unlinks
the old journal can lose to a flush that lands afterward and puts the file
back. Fix by keeping live writers in a map keyed by session id inside
`createAgentSessionsService`, so the discard path can `dispose()` the old
writer — cancelling its pending timer, writing nothing — _before_ unlinking.
That closes both the resurrect bug and the race with one change, and it gives
the service a legitimate handle on writer lifetime it currently lacks.

`deleteJournalFile` stays host-internal.

### Panel: three entry points, one path

All three set the existing `continueFreshRef` plus a discard flag and bump
`nonce`. The reconnect effect already resets transcript, permissions,
commands, config options, attachments, and `busy` — so the panel's manual
`setTranscript(emptyTranscript)` is **deleted**, not extended. Net result is
less panel code than the current implementation.

### Host-reserved slash commands

`clear` becomes the first (and only) **host-reserved** command name. When an
agent advertises a command called `clear`, the palette substitutes Silo's own
entry — same name, Silo's description, Silo's handler — so what the user reads
matches what will happen. A raw typed `/clear` hits the same intercept. The
agent never sees it.

Shadowing an agent-owned name needs a justification, and the one here is
narrow on purpose: **Silo's reset does everything the agent's `/clear` does
and more.** Nothing is hidden, only replaced with a superset. That is the test
any future reservation has to pass, and most would not — this is a reserved
name, not an open namespace.

## Alternatives considered

**A persisted "cleared-through" watermark, no deletion.** The panel records
how far it has cleared past in its `DockPanelRecord` params and paints the
restored transcript from there. Genuinely non-destructive and agent-agnostic,
and it was the better answer while "clear" still meant "clear the view." It
loses once clear means reset: a watermark leaves the agent remembering
everything the user just cleared, which is the confusing half of today's
behavior rather than a fix for it.

**`AgentSessionHandle.clearTranscript()`.** Correct in a way the service-level
`clearJournal` is not — a handle can reach the writer. But it still separates
"clear the transcript" from "start a new session," and those are now one
action. Reconnecting is already the mechanism; a second method that has to
partially reproduce it is redundant surface on a `@beta` API.

**Leave `/clear` to the agent and name Silo's action `/new`.** No shadowing,
no reservation rule, no precedent to police. Rejected because it asks the user
to know which of two nearly-identical commands the app implements — the exact
confusion this proposal exists to remove.

**Let `/clear` through and discard the journal after the turn.** Fragile:
there is no reliable signal that the agent honored it, and an agent that does
not advertise `/clear` receives it as literal prompt text.

## Scope

- `packages/sdk` — the `transcript` field, TSDoc, `pnpm docs:api`, and a pass
  over the hand-authored `apps/docs/api/agents/sessions.md` resume section.
- `packages/extension-host` — live-writer map, the discard branch in
  `connect()`, tests in `acp-sessions-service.test.ts` and
  `chat-session-journal.test.ts` (including the "live writer must not
  resurrect the file" case).
- `packages/extensions-silo` — reset wiring for ⌘K / context menu / `/clear`,
  palette substitution, `command-palette.test.ts`.
- `docs/domain-language.md` — **session reset** as the term now that three
  surfaces name one operation ("Clear" stays the user-facing label).
- RFC 0040 — the host-reserved command rule.
- RFC 0042 — a note that `transcript: "discard"` is the deliberate-clear
  sibling of open question 2's recovery default.

Whether the reserved-command rule earns its own ADR (alongside 0052, which
records chat-session resurrection) is worth deciding at acceptance — it is a
standing constraint on the command surface, not a detail of this change.

## Decision

Accepted 2026-09-15. Clear means session reset, reached through
`transcript: "carry" | "discard"` on the existing resume options —
`ctx.agents.sessions.clearJournal()` is **not** added, and the in-flight
implementation of it was reverted rather than refined. `clear` is
host-reserved across every agent.

Still open at acceptance: whether the host-reserved command rule earns its own
ADR alongside 0052. It is a standing constraint on the command surface rather
than a detail of this change, which argues yes — decide when the
implementation lands.
