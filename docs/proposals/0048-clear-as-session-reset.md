---
status: implemented
created: 2026-09-15
---

# 0048. Clear is a session reset

## Summary

"Clear Session" in a Chat panel means one thing everywhere: **end the current
session, start a new one, and discard the previous session's transcript
journal.** ⌘⇧K, the transcript context menu's **Clear Session**, and a typed
`/clear` are three gestures for that single operation — a **session reset**,
confirmed before it runs.

The whole public surface change is one optional field on the resume options
`connect()` already takes: `transcript?: "carry" | "discard"` on
`AgentSessionRestore`. No new `ctx` method. The rest is host-side ownership of
journal writers (so a discard actually sticks) and panel wiring (so the three
gestures reach one path).

## Motivation

**Clearing didn't clear anything durable.** The gesture blanked the React
transcript and stopped there. The transcript journal
(`<workspace-state-dir>/chat-sessions/<sessionId>.jsonl`, RFC 0042) survived,
so reopening the panel painted every turn back; the agent survived too, so it
kept answering as if the conversation had happened. The only thing that changed
was the one thing the user was least confused about.

**Clearing is a session-lifecycle operation, not a file operation.** The first
attempt at a fix added `ctx.agents.sessions.clearJournal(sessionId)` and
unlinked the file. That cannot work: `journalWriter` is closure-local inside
`connect()` and holds every line of the session in memory, because a flush is a
whole-file rewrite (there is no `fs_append_text`). A service-level unlink has no
way to reach that writer, so the next `append` writes the whole transcript
straight back. The clear only appears to stick when nothing flushes before
disposal.

**The terminal analogy breaks on the agents that need it most.** ⌘K in a
terminal clears scrollback and the shell is unaffected. For a `session/load`
agent the journal is a cache and deleting it is harmless — the agent replays it
back. For a `resume`-only or `journal-only` session it is the sole copy. The
same keystroke being a no-op for some agents and permanent deletion for others
is not a contract anyone can reason about; making it _always_ a reset is.

**`/clear` already collided.** Silo hardcodes no commands — the palette is
populated purely from the agent's `available_commands_update` (RFC 0040). Claude
advertises its own `/clear`, which drops the agent's context and leaves Silo's
journal untouched. Two words, two outcomes, neither the whole job.

## What shipped

1. **`transcript?: "carry" | "discard"` on `AgentSessionRestore`** — what
   becomes of the prior session's journal when `startFresh` skips straight to
   `session/new`. `"carry"` is the default and keeps RFC 0042's behavior exactly;
   the field is **inert without `startFresh`**, so a plain resume / load /
   journal-only restore never deletes anything, whatever it says.
   `clearJournal` was **not** added — the discard happens where the writer is
   created, which is what makes it correct.

2. **The service owns its live journal writers.** `createAgentSessionsService`
   keeps a `Map<sessionId, ChatSessionJournalWriter>` keyed by the _journal's_
   id, with `trackWriter` / `untrackWriter` closures routing every creation,
   re-key, and disposal. Its invariant: **a writer stays reachable from the map
   for as long as it can still write.** The discard path can therefore silence
   the prior writer before unlinking its file.

3. **`ChatSessionJournalWriter.abandon()`** — marks a writer dead for `append`,
   `flush`, and the debounced timer alike, clears `dirty`, and resolves once any
   write already in flight has settled. `dispose()` keeps its old meaning (stop
   the timer, keep the buffer for a re-key), so the existing re-key paths are
   untouched. Paired with a host-internal, best-effort, never-throwing
   `deleteJournalFile(workspaceId, sessionId)`.

4. **The discard branch in `connect()`**: `abandon()` the tracked writer →
   `deleteJournalFile` → `session/new` → a fresh writer seeded empty under the
   new id. No `readJournalLines`, no carry, no re-key.

5. **One reset path in the panel, three entry points.** `resetSession()` sets a
   restart-intent ref and bumps `nonce`; the existing reconnect effect does
   everything else — it already resets transcript, permissions, commands, config
   options, attachments, and `busy`, so the manual `setTranscript(emptyTranscript)`
   clear was deleted rather than extended. Net panel code went down. The three
   gestures: the transcript context menu's separated **Clear Session** row (⌘⇧K
   accelerator), a `keydown` handler on the panel root, and a `/clear` intercept
   in `send()`.

6. **A confirmation in front of all three.** `requestReset()` wraps
   `resetSession()`: it shows the **Clear session?** dialog, and only a
   confirmed choice reaches the reset. The dialog carries a "Don't ask again"
   box that writes a persisted global preference, reversible at
   Settings → Agents → **Chat**. The confirmation belongs to the _gesture_, not
   to `resetSession()` — the reconnect effect has to be able to run a reset it
   has already been told to do without asking a second time.

7. **`clear` reserved by the Chat panel.** The `/` palette substitutes Silo's
   entry for an agent-advertised `clear` (one row, not two) and appends it when
   the agent advertises none, so what the palette lists matches what typing it
   does. The agent never receives `/clear`. `/clear foo` is **not** reserved and
   goes to the agent as before — Silo's reset takes no argument, and silently
   swallowing text the user typed would hide it.

## Design worth keeping

### Why the field and not a method

`AgentSessionConnectOptions.resume` already carries `startFresh`. `transcript`
is a second value on the same axis, not a reversal of **RFC 0042 open
question 2**: that question was about _journal-only recovery_ — the agent cannot
resume, so "Continue in a new session" carries the conversation forward under
the new id rather than losing it. That remains the default and stays correct. A
user-requested clear is the opposite intent on the same mechanism.

`AgentSessionHandle.clearTranscript()` was the near miss: a handle _can_ reach
the writer, so it is correct where the service-level `clearJournal` is not. It
still separates "clear the transcript" from "start a new session," and those are
one action. Reconnecting is already the mechanism; a second method that
partially reproduces it is redundant surface on a `@beta` API.

### The ordering that makes a discard stick

The panel's effect teardown fires an **unawaited** `void writer.flush()`. React
runs an effect's cleanup _before_ the effect body re-runs, so `dispose()` always
precedes the reconnect's `connect()`. An early version unregistered the writer
synchronously in `dispose()` and only then scheduled the teardown flush — so the
discard's map lookup always missed, `abandon()` never ran, and the flush rewrote
the journal after the unlink. `dispose()` now unregisters only once its teardown
flush has settled, identity-guarded so a newer connection's writer under the
same id survives. The regression test disposes _then_ connects (the only order
the panel produces) with a flush that takes a tick, because a real one is Tauri
IPC, not a microtask.

### Reset precedence in the composer

A typed `/clear` must work exactly when ⌘⇧K and the menu row do. Putting the
intercept behind `send()`'s guard (`!handle || busy || !composerCanSend(...)`)
made it inert mid-turn, while connecting, and when lost — precisely when the
other two gestures still reset. Precedence now lives in one pure
`composerSubmitAction()`: **the reserved draft outranks the send guard and
answers to `canReset` alone.** A reset needs no live handle.

### The intent carries its own session id

The reconnect effect keys on `params.sessionId`, which a panel that has
connected but not yet had its `DockPanelRecord` written does not have. Reading
the live `sessionId` inside the effect would add it to the effect's
dependencies and reconnect on every change. Resolving the id in the gesture —
`params.sessionId ?? sessionId`, persisted first, live as fallback — keeps the
deps as they were and makes the not-yet-persisted case fall out for free. With
neither, `resetSession()` returns without bumping `nonce`.

### ⌘⇧K is a DOM handler, not a keybinding

Every other shortcut in the app is a contributed command with a registered
keybinding scoped by a context key — the terminal's own Clear
(`core.terminal.clear`, scoped by `terminalFocused`) is the pattern. Chat's
⌘⇧K deliberately does not follow it: copying it requires a new public
`ContextKeys` member for chat focus plus the host plumbing to maintain it, SDK
surface this change did not design. It is instead a bubble-phase `keydown`
handler on the panel root (`.acp-chat`) — not the scroller, so it fires while
typing in the composer; not `document`, so a terminal panel's own ⌘K is
untouched and a background Chat panel never answers for the one the user is
looking at.

**Shift is part of the binding, not decoration.** Plain ⌘K is the terminal's
scrollback clear on every platform and a near-universal "clear the view"
reflex; hanging "end the session and delete the transcript" off it invites the
muscle-memory press this change's own confirmation exists to catch. ⌘⇧K is
unclaimed anywhere in the app.

Three costs, accepted knowingly: the shortcut is not user-rebindable; the
keybinding registry dispatches on the **capture** phase and `preventDefault`s on
any match, so a future `cmd+shift+k` with a broader `when` would swallow Chat's
Clear Session silently; and the menu row hard-codes its accelerator label
(`clearShortcutLabel`) rather than resolving it through the keymap. The handler
is therefore a thin wrapper over `requestReset()`, so a later change that
contributes a real command binds the same function rather than replacing this
work. Tracked as [issue #537](https://github.com/silo-code/silo/issues/537).

### Why the deletion is admissible — and why it confirms

**ADR 0046** says the host never deletes user data without asking, and a
transcript journal _is_ user data — for a resume-only or journal-only session,
the only copy. The rule's carve-out is that deletion be an explicit, opt-in
choice at the moment of the destructive action, which is most of what ⌘⇧K /
**Clear Session** / `/clear` are: a deliberate, named, user-initiated gesture
whose one documented meaning is "throw this conversation away."

This originally shipped with **no** confirmation, on the analogy that closing a
terminal does not confirm discarding its scrollback. That analogy was wrong in
the one place it mattered: a terminal's scrollback is a view of output that
already happened, while for a `resume`-only or `journal-only` session the
journal _is_ the conversation, with no other copy anywhere. A gesture that is
one keystroke away from muscle memory should not be the last thing standing
between the user and that. So every entry point now confirms, and the
confirmation is where the explicit choice is made.

Skipping it is a **persisted, reversible preference** — set from the dialog's own
"Don't ask again" box, turned back on at Settings → Agents → **Chat**. Opt-out
rather than opt-in, and never a one-way door: a "don't ask again" the user
cannot undo would be a worse trap than the missing dialog was.

What this still obliges is that the label and its description say the transcript
goes away, not merely that the view clears — which is also why the menu row is
**Clear Session** rather than "Clear" sitting next to Copy and Select All, where
it reads as a third thing done to the text on screen. Recorded durably as a
Consequences bullet in [ADR 0054](../decisions/0054-reserved-slash-commands.md):
a reserved name is what makes the deletion admissible, and anything programmatic
or inferred stays under ADR 0046's default.

### Error handling

A failed unlink is logged to `agentsChannel` and ignored; the reset continues,
and the worst case is a stale journal for an id nothing references, which the
existing orphan prune collects. A failed `session/new` after the discard rejects
`connect()` and the panel shows its normal connect error — the journal is
already gone by then, which is what the user asked for, and the alternative
(delete only on success) reopens the resurrection race this design exists to
close.

## Alternatives considered

**A persisted "cleared-through" watermark, no deletion.** The panel records how
far it has cleared past in its `DockPanelRecord` params and paints the restored
transcript from there. Genuinely non-destructive and agent-agnostic, and the
better answer while "clear" still meant "clear the view." It loses once clear
means reset: a watermark leaves the agent remembering everything the user just
cleared — the confusing half of the old behavior rather than a fix for it.

**Leave `/clear` to the agent and name Silo's action `/new`.** No shadowing, no
reservation rule, no precedent to police. Rejected because it asks the user to
know which of two nearly-identical commands the app implements — the exact
confusion this change exists to remove.

**Let `/clear` through and discard the journal after the turn.** Fragile: there
is no reliable signal that the agent honored it, and an agent that does not
advertise `/clear` receives it as literal prompt text.

## Deliberately out of scope

- A **dock tab** context-menu entry. The tab menu is host chrome (`DockTab.tsx`)
  with no extension contribution point; adding one is new SDK surface. Only the
  transcript context menu is wired.
- A rebindable command contribution for Clear Session — see "⌘⇧K is a DOM
  handler" above and [issue #537](https://github.com/silo-code/silo/issues/537).
- Any reserved command other than `clear`.
- Moving the reservation into the host or the SDK (an `AgentCommand`
  discriminator) so other Chat UIs inherit it — see ADR 0054's alternatives. The
  reservation is the panel's: `ctx.agents` substitutes nothing, so a third-party
  Chat UI forwards `clear` to the agent unless it opts in to the same convention.
- Changing what a plain restore (resume / load / journal-only) does.

## Implementation

- `packages/sdk/src/agents-service.ts` — the `transcript` field; the whole public
  surface change. Docs: `apps/docs/api/types/interfaces/AgentSessionRestore.md`
  (generated), the "Clearing a session" section of `apps/docs/api/agents/sessions.md`
  (hand-authored), and the Chat sessions roadmap row.
- `packages/extension-host/src/extension-host/agents/chat-session-journal.ts` —
  `abandon()`, `deleteJournalFile`.
- `packages/extension-host/src/extension-host/agents/acp-sessions-service.ts` —
  the live-writer map and the discard branch in `connect()`.
- `packages/extensions-silo/src/agents-chat-panel/` — `resetSession()` /
  `requestReset()` and the restart intent in `AcpChatPanel.tsx`;
  `sessionResetOption` in `session-restore.ts`; `withReservedCommands` /
  `isReservedDraft` / `isClearShortcut` / `clearShortcutLabel` in
  `command-palette.ts`; `composerSubmitAction` in `composer-model.ts`; the
  `Clear Session` row in `selection-menu.ts`; the confirmation in
  `ClearSessionDialog.tsx`, its preference in `settings-store.ts`, and the
  settings control in `settings.tsx`.
- `packages/extensions-core/src/agents-settings/` — the Agents settings page's
  **Chat** tab, fed by `silo.agents-chat-panel`'s published
  `ChatPanelExtensionAPI` (the same bundled-only `getExtension` edge
  `silo.agents` already uses for its Behavior / Navigator / Display panels).

Nothing moved on the host ↔ extension boundary beyond that one optional field.
The panel still reaches the app only through `ctx` — the confirmation is
`ctx.ui.showModal` and the preference is `ctx.storage.global` — and
`deleteJournalFile` stays host-internal. The Chat tab is an
extension-to-extension edge (`core.agents-settings` → `silo.agents-chat-panel`),
not a host one.

## Related

- [ADR 0054](../decisions/0054-reserved-slash-commands.md) — a slash command is
  the agent's, unless Silo's Chat panel answers a superset. The standing rule
  every future reservation has to pass.
- [RFC 0040](./0040-agent-commands-and-context.md) — commands come from the
  agent; records the reserved-command exception next to the surface it
  constrains.
- [RFC 0042](./0042-chat-session-resurrection.md) — the transcript journal and
  the `startFresh` carry default that `"discard"` is the sibling of.
- [ADR 0046](../decisions/0046-never-delete-user-data-unprompted.md) — the host never deletes
  user data without asking.
- **Session reset** in [`docs/domain-language.md`](../domain-language.md).
