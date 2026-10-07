---
status: implemented # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-10-06
---

# 0056. A durable idle timestamp on `AgentInfo`

## Summary

`ctx.agents` told an extension when a session started working (`workingSince`)
and when it raised an unread finish (`attentionSince`), but not when it
**stopped**. The one consumer that needed it — the Agents navigator's "done"
rows — reconstructed the timestamp itself by watching snapshots and stamping
the first moment it observed a session as done. That reconstruction was wrong
in practice. This adds `AgentInfo.idleSince` — host-owned, set where every
other turn field is set, persisted for both session kinds — and deletes the
extension-side tracking it replaces.

## Motivation

The Agents navigator shows a duration on every row. `ready` and `working` rows
took theirs from the host; `done` rows took theirs from `done-since.ts` in
`silo.agents`, which kept a `sessionId → first-seen-done` map in
`ctx.storage.global` and rebuilt it from each snapshot:

```ts
for (const a of agents) {
  if (sectionFor(a) !== "done") continue;
  next.set(a.id, prev.get(a.id) ?? nowIso);
}
```

Any id missing from one snapshot was dropped, and the pruned map was written
straight back to storage. The next snapshot that did contain the session
stamped it `nowIso`. **One transient absence permanently destroyed the real
timestamp.**

Chat sessions are absent from snapshots as a matter of course. A dormant
registration (RFC 0042) only appears once `store.hydrated` is true and the
store subscription has run; a live `connect()` withdraws the dormant entry and
re-registers under the same id. Terminal sessions are attached earlier in the
same `syncSessions` pass and so survive. The result was a clean split that
matched what users saw: every Chat session's done-duration reset on restart;
Terminal sessions kept theirs.

Observed on a real profile, against an app boot at 19:40:32:

| row                                     | stored stamp | truth                     |
| --------------------------------------- | ------------ | ------------------------- |
| `term_3c1d…`                            | 18:57:53     | correct, survived 2 boots |
| `term_878b…`                            | 18:59:00     | correct                   |
| `chat:8c70…` "Bugfix worktree"          | 19:40:33.037 | boot + 1.0s               |
| `chat:650d…` "Task tool counting test"  | 19:41:33.581 | boot + 61.6s              |
| `chat:e88d…` "Background sleep command" | 19:41:33.581 | boot + 61.6s              |
| `chat:d4d6…` "scratch.txt editing"      | 19:41:33.581 | last really live Oct 1    |

Three rows re-stamped to the same millisecond — one snapshot pruned them as a
group. The last row's session had not run in five days and was showing seconds.

The deeper point is that none of this belonged in an extension. The host
already knew when a turn ended — `endTurn` in `agent-turn-model.ts` is the one
place both kinds pass through — and already persisted everything around it.
The extension was reconstructing, unreliably and from the outside, a fact the
host held exactly.

## The change

### The surface

One optional field on `AgentInfo`, alongside the two turn timestamps already
there:

```ts
readonly idleSince?: string;
```

The three now cover the lifecycle without overlap: `workingSince` while
running, `attentionSince` while an unread finish is pending, `idleSince` from
the moment a turn ends for as long as the session stays stopped. The glossary
names the set **Turn Timestamps**.

The asymmetry with `attentionSince` is the whole reason the field is worth
having: `acknowledge` clears attention, because attention is about _unread_.
A session that has finished **and been seen** therefore has no `workingSince`
and no `attentionSince` left — nothing to date a settled row from. `idleSince`
is what a "finished 3h ago" row reads.

It is documented as a **lower bound**, not a precise turn boundary. Where Silo
observed the stop it is exact; where it did not — a record predating the field,
or a session mid-turn when the app exited — it is the `lastLiveAt` estimate
below, and the two are indistinguishable to a reader. `stale` does not
disambiguate them: it is scoped to a restored `working`/`needsAttention`
duration, so a settled row carrying an estimate reports `stale: false`. Rather
than widen `stale` or add a second flag to the public surface, the TSDoc states
the weaker guarantee the field can actually keep — the same honesty rule ADR
0028 applies to resume hints, one field over. The estimate is self-correcting:
the next real stop replaces it.

### Where it is set

`idleSince` joined `TurnPhase`, so both session kinds get it from the same
core with no per-kind logic:

- **`endTurn`** stamps `ev.now` at the working → stopped edge, and also the
  **first** time a session is seen stopped without a timestamp at all — but
  never again after that. All three outcomes count: `finished`, `cancelled`
  and `failed` all mean the session stopped. Both halves of the rule are
  load-bearing. Re-stamping on an idle-from-idle tick would walk the timestamp
  forward for a session that had not run in days, which is the failure being
  fixed; but keying _only_ on the edge leaves a session that reaches `idle`
  without passing through `working` in this process with no timestamp
  forever. That second case is the common one on restore, not an edge: a
  reattached terminal replays its OSC scrollback as an idle prompt against a
  state machine starting at `"none"`, so its only transition is
  `none → idle`. First observation wins and then holds, and better
  information — a persisted stamp, or the `lastLiveAt` estimate below — is
  already in `prev` before anything reaches here.
- **`beginTurn`** clears it to `null`.
- **`witnessTurn`** leaves it alone.

The terminal reducer's three non-turn stops (`dead`, `exited`,
`process-gone`) bypass `endTurn`, and each gained a `now` on its event. They
call the **same function** `endTurn` does — `stoppedIdleSince`, the single
implementation of the rule. That is not where this started: the reducer first
carried its own copy, which agreed with the turn core right up until the core
grew the first-observation clause and the copy did not. The architecture review
of the implementing PR caught the divergence, with a real failure — a terminal
confirmed dead having never run a turn in this process got no timestamp, and
`sectionFor` still routes `dead` into the panel's "done" section, so the row
rendered blank. Two implementations of one rule is the defect; one function is
the fix. A terminal confirmed dead after sitting idle for three days reports
the three-day-old stamp, not boot time.

### Persistence

`PersistedAgentInfo` and `PersistedChatSession` each gained an optional
`idleSince`. No migration and no version bump: an older record simply lacks
the key, and the restore rule below is what gives such a record an age.

Restoring a session whose turn end was never observed needs a rule, and it
turned out to be the same rule for both kinds — `restoredIdleSince` in the
shared turn core. A precise stamp always wins; without one, a session that
comes back **stopped** falls back to the record's `lastLiveAt`. That is the
last _live detection signal_ (not a reconnect or a title refresh — the only
write site is gated on `isLiveTick`), so for a session that stopped and was
never touched again it is very close to the truth, and it is an honest lower
bound otherwise. A Terminal session that comes back still `working` reports
nothing: `workingSince` is the field that row reads, and its real finish still
arrives through `endTurn`. The estimate is self-healing — the first real turn
end overwrites it and persists the exact value.

The **replay guard** is where this actually broke in practice, and it is the
most instructive miss. On reattach the session host replays the terminal's
ring, and `applyDetection` quarantines what replayed bytes may touch — ADR
0050 §5, "replayed bytes are identity evidence, never activity". That guard
restores `activity` / `needsAttention` / `attentionSince` / `workingSince` /
`workingSource` / `stale` from the pre-event state and lets only identity
through. Adding a sixth turn field without adding it to that list meant a
replayed "working" marker ran `beginTurn`, which clears `idleSince`, and the
clear survived the guard — so every reattached Terminal session lost its
restored timestamp. `idleSince` is turn state and now rides with the rest —
and the guard was **inverted** while fixing it, so that it quarantines by
default: it keeps the pre-event state and lets only the five identity fields
through, rather than naming the turn fields to roll back. The two forms are
equivalent today, but a denylist of turn fields fails open every time
`TurnPhase` grows, with nothing to make it a type error. This one fails closed.

A **live `connect()`** is the third place a session arrives without an
observed turn end, and the easiest to miss: it builds a fresh `AgentInfo` and
hands it to `registerChatAgent`, which overwrites the dormant entry in place.
Both registrations there — the pre-handshake placeholder and the real one —
now seed `idleSince` from the persisted status through the same helper.
Without that, a restored row's duration appeared from the dormant entry and
then vanished the instant its panel mounted, so the rows that looked broken
were exactly the ones in the workspace you were actually looking at.

**This fallback is the whole reason the change works on an existing profile,
and the first cut shipped without it.** The accepted design scoped it to the
mid-turn-restart case and explicitly put backfill out of scope, reasoning that
inventing a stamp was the bug being fixed. That was wrong: _no_ record written
before the field existed carries an `idleSince`, so on the first restart every
row in the Agents navigator — ~80 Terminal sessions and every Chat session —
went blank rather than wrong. Showing nothing for a session that plainly
finished at a knowable time is not the conservative choice, it is a worse
answer than the estimate. `lastLiveAt` was already sitting in both records.

### What it replaced

`done-since.ts` and its test were deleted outright, along with
`updateDoneSince`, the `agentsDoneSince` storage key, and the wiring in
`index.tsx` / `agents-panel.tsx`. `buildAgentRows` lost its `doneSince`
parameter and reads `a.idleSince` for the `done` section, exactly as it
already read `a.attentionSince` and `a.workingSince` for the other two.

Stale `agentsDoneSince` bags are abandoned in global extension storage rather
than migrated — the stored values are the bug, and the field they fed is now
host-supplied.

## Alternatives considered

**Fix the pruning in `updateDoneSince`.** Keep stamps for ids absent from the
snapshot, and garbage-collect with a "seen this run" set. ~20 lines, no SDK
change. It fixes the reset but leaves the extension reconstructing a host fact
from the outside: the stamp still means "when this extension first noticed",
so a session that finished while the extension was unloaded still dates from
first sighting. Rejected as a stopgap.

**Expose `lastLiveAt` instead of adding a field.** Already persisted for both
kinds, no new plumbing. But as the _definition_ it is "last moment the host
saw this session alive", which drifts from "when the turn ended" as soon as
anything else refreshes it — the same trap `TerminalRecord.lastActiveAt` had
already set for this exact consumer, whose only write site is a backend
reconnect. `idleSince` is defined by a turn boundary and nothing else.
`lastLiveAt` earns its place as the _restore-time estimate_ (above), where
being a lower bound is exactly what is wanted.

**Reuse `attentionSince` for done rows.** It is cleared by `acknowledge`,
which is precisely the transition into "done" — gone exactly when needed.

## Decision

Accepted and implemented. `AgentInfo.idleSince` is the host-owned answer to
"when did this session stop", set in the shared turn core, persisted for both
kinds, and unaffected by acknowledgment. No ADR: this extends RFC 0038's
existing decision that the turn lifecycle lives in one kind-agnostic core
rather than establishing a new one.

Verified with `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, `pnpm lint`
and a runtime check in dev Silo against a real profile — the check that caught
the missing backfill, and the reason it is worth repeating after any change to
the restore rule. Coverage lives in `agent-turn-model.test.ts` (the turn rule
and `restoredIdleSince`, for both kinds), `agent-activity-model.test.ts` (the
three stops, `reset`, and the `restoreState` round-trip),
`chat-session-restore.test.ts` (persist, restore, the `lastLiveAt` fallback),
`acp-sessions-service.test.ts` (a reconnect keeping the age, for both the
placeholder and the real registration), `agents-service.test.ts` (the reattach
path end to end: restore, the `lastLiveAt` estimate, and surviving a replayed
turn) and `agents-panel-view.test.ts` (done rows dating from `idleSince`).

Roadmap: the `ctx.agents` row names the three Turn Timestamps and links here.
Glossary: **Turn Timestamps** under Agent Sessions.
