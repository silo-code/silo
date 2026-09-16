---
status: accepted
date: 2026-09-16
---

# 0054. A slash command is the agent's, unless Silo's Chat panel answers a superset

## Context

A Chat session's `/` palette is populated **entirely** from the agent's own
`available_commands_update` (RFC 0040). The platform contributes nothing to it
and validates nothing in it: an `AgentCommand` is a protocol-level name the
agent advertised, and picking one sends that name as prompt text. That is
deliberate — command discovery belongs to whatever is on the other end of the
connection, and Silo cannot know what any given agent's commands mean.

`clear` broke the assumption that this is enough. Claude advertises its own
`/clear`, which drops the agent's context; Silo separately journals the
transcript to disk as the conversation-of-record (RFC 0042), and that journal
is untouched by anything the agent does. So the same word produced two
different outcomes depending on who handled it, and neither one was "clear this
conversation": the agent's forgot while the transcript stayed, and Silo's own
Clear blanked the view while both the agent and the journal remembered
everything.

RFC 0048 makes Clear mean one thing — a **session reset**: end the session,
start a new one, discard the journal. That only holds if `/clear` reaches it,
which means answering a command name the agent believes it owns.

## Decision

**Silo's Chat panel forwards every slash command to the agent, except a small
closed set of reserved names where its own action is a strict superset of the
agent's.** A reserved name is substituted into the palette (same name, Silo's
description, Silo's handler) and intercepted before `prompt()`, so what the
user reads is what happens — and it is offered even when the agent advertises
no such command, so the palette and the composer never disagree.

**`clear` is the only reserved name today**, and the superset test is what
admits it: an agent's `/clear` drops its own context; Silo's reset drops that
_and_ the transcript journal underneath it, which no agent can reach.

**The reservation is a convention of the Chat panel (`silo.agents-chat-panel`),
not a platform mechanism.** The host and the SDK have no notion of a reserved
name: `ctx.agents` hands every consumer the agent's command list exactly as the
agent sent it, and the substitution and the interception both happen in the
panel. That is the honest layering for now — the panel is what owns the
composer, the palette, and the reconnect a reset performs, so it is the only
place that can both offer the entry and answer it.

## Consequences

- One vocabulary **in Silo's Chat panel**. `/clear` means the same thing there
  on every agent, including agents that advertise no `clear` at all, and
  matches what ⌘⇧K and the transcript's **Clear Session** item do.
- **A third-party Chat UI gets the agent's raw commands.** An extension
  building its own chat surface on `ctx.agents.sessions` sees the agent's
  `clear` and forwards it, so `/clear` there means whatever that agent means by
  it. Such an extension has to opt in to this convention to get the same
  vocabulary; nothing in the platform gives it for free, and nothing stops it
  from reserving a different set.
- The user loses nothing they could otherwise have had. A superset is the
  entire justification: the agent's behavior still happens (a fresh context),
  plus the part only the host can do.
- **A reserved name plus a confirmation is what makes the deletion admissible
  under [ADR 0046](./0046-never-delete-user-data-unprompted.md).** The extra
  thing Silo does here is destroy the transcript journal — for an agent that
  can neither `resume` nor `load`, the only copy of that conversation — with no
  undo. ADR 0046's carve-out is that deletion be an explicit, opt-in choice _at
  the moment of the destructive action_. A named, user-initiated gesture is
  most of that choice: the user typed `/clear`, pressed ⌘⇧K, or picked **Clear
  Session**. A confirmation dialog supplies the rest, and every gesture goes
  through it — the original reading, that the gesture alone sufficed on the
  analogy of a terminal's scrollback clear, undervalued a journal that for some
  agents is the conversation's only copy. Skipping it is a persisted, reversible
  preference the user sets from the dialog's own "Don't ask again" box, never a
  default and never a one-way door (Settings → Agents → Chat turns it back on).
  The obligation this leaves on the wording still stands — the palette
  description, the menu row, and the dialog have to say the conversation is
  discarded, not that the view is cleared. Nothing programmatic or inferred is
  covered: a restore, a migration, or host-side cleanup deletes nothing, per
  ADR 0046's default.
- The bar is narrow enough to police. A reservation that renames, restricts,
  reinterprets, or merely duplicates an agent's command fails the test.
  Reserving a name whose meaning differs per agent would fail it too. In
  practice almost nothing else qualifies — this is a reserved name, not an open
  namespace, and adding to the set is an amendment to this ADR.
- It commits Silo to keeping the reserved action a superset _over time_. If an
  agent's `/clear` grew a behavior Silo's reset does not have, the honest
  responses are to match it or to stop reserving the name — not to keep
  shadowing it.
- Reversible per name. Dropping a reservation is deleting an entry: the agent's
  command flows through again, unchanged.

## Alternatives considered

- **Reserve the name in the host instead of the panel.** `ctx.agents` would
  substitute the entry so every consumer's `commands` already carried it, with
  a discriminator on `AgentCommand` (e.g. `source?: "agent" | "host"`) so a UI
  could tell one apart. Deferred, not rejected: it is real public SDK surface,
  the interception would still have to live in the panel (only the panel owns
  the reconnect), and no third-party Chat UI exists to benefit. The
  discriminator is additive, so deferring costs nothing.
- **Name Silo's action `/new` and leave `/clear` alone.** No shadowing, no
  rule, no precedent to police. Rejected: it asks the user to know which of two
  nearly identical commands the app implements, and leaves the agent's
  `/clear` doing the half-thing that caused the confusion.
- **Let `/clear` through and discard the journal after the turn.** Fragile —
  there is no reliable signal that the agent honored it, and an agent that does
  not advertise `/clear` receives it as literal prompt text.
- **Reserve nothing; make Clear Session a UI gesture only (⌘⇧K and the menu).** Leaves a
  typed `/clear` meaning something different from the button next to it, which
  is the status quo this replaced.
- **An open reservation namespace (`/silo:clear`, or a registry extensions can
  add to).** Deferred, not rejected. Nothing needs it yet, and a general
  mechanism would invite reservations that could not pass the superset test.

## References

- [RFC 0048](../proposals/0048-clear-as-session-reset.md) — Clear is a session
  reset (this rule's origin and its only reserved name).
- [RFC 0040](../proposals/0040-agent-commands-and-context.md) — commands come
  from the agent; "Reserved commands" records the rule alongside it.
- [ADR 0052](./0052-chat-session-resurrection.md) — the transcript journal as
  conversation-of-record, which is the part of a reset no agent can reach.
- [ADR 0046](./0046-never-delete-user-data-unprompted.md) — why the reset
  deletes only on an explicit user gesture.
