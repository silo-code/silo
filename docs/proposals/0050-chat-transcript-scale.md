---
status: draft
created: 2026-09-16
revised: 2026-09-17
---

# 0050. Chat transcript scale

> **Returned to `draft` on 2026-09-17.** The 2026-09-16 decision was accepted on
> measurements that turned out to come from an unrepresentative load-test
> fixture, and the root cause has since been identified. The lever has changed —
> see "Revision 2026-09-17" — so this needs re-accepting rather than quietly
> continuing.

## Summary

Silo degrades to ~2–11 fps once a session has several workspaces warmed. The
cause is **not** the size of any one transcript. It is WebKit's memory-pressure
handler: above a footprint threshold it repeatedly drops the style resolver and
inline-layout caches, which invalidates style and layout for the **entire
document**, and Silo keeps every warmed workspace's dock in that one document.

The failure needs **two factors at once**:

1. **Process footprint above WebKit's pressure threshold** (measured cliff:
   1.5–1.8 GB) — this sets how _often_ a document-wide invalidation fires. It
   fires on WebKit's own timer, with no JavaScript involved.
2. **A large render tree in the document** — this sets how _much each one costs_
   (390 ms at 87k nodes vs 52 ms at 698 nodes; an ordinary _local_ invalidation
   is 4 ms at any size, because WebKit is properly incremental).

Neither factor alone produces the symptom. That is why single-cause explanations
kept failing.

Factor 1 is effectively unfixable in-process — the memory is never returned. So
this proposes attacking factor 2: **bound how much a non-visible workspace keeps
in the render tree.** The unit is the whole document, which is N × per-warmed-
workspace — not one transcript.

The identity and scroll-anchor work below survives on its own merits (a
quadratic `findIndex`, and a retry loop that exists to paper over a DOM
teardown), and remains a prerequisite for any windowing.

## Revision 2026-09-17 — what changed and why

Full evidence in `scratchpad/transcript-load/FINDINGS.md`. Three things
invalidated the original framing.

**The load-test rig overstated transcript DOM by ~20× per turn.**
`transcript-gen.mjs` built each Edit from two _independently random_ code blocks,
which share no common prefix or suffix, so `diffLines`' trim could not fire and
every line became an add or a delete. Real edits trim to ~19 rendered rows; the
rig emitted ~568.

|                        | turns  | transcript DOM nodes |
| ---------------------- | ------ | -------------------- |
| old rig                | 8      | 87,266               |
| old rig                | 24     | ~291,000             |
| **real 27 MB session** | **48** | **14,826**           |

Every node count in the original "Measured cost" table is a rig number. The rig
is fixed as of 2026-09-17 and now lands within ~10% of real journals.

**A real transcript does not build a pathological tree.** Census of the same
27 MB / 48-turn / 625-tool-call session this RFC cites, planted into the panel:
14,826 nodes — diff lines 47%, SVG icons 14%, link/tooltip wrappers 10%,
tool-call heads 10%, markdown 5%, and **zero** collapsed tool bodies (the
existing collapse uses conditional rendering, not CSS hiding, and works).

**The cost is the multiplier, and it is not JavaScript.** Over 33 seconds of the
live symptom: 0 rAF frames, 0 layout reads, 0 ResizeObserver callbacks, 1 DOM
mutation, and layout output byte-identical across three snapshots of 11,122
elements. The driver is WebKit's async layout timer plus its style-recalc timer,
with `MemoryPressureHandler` → `releaseMemory` → `LineLayout::releaseCaches` on
the main thread.

The two-factor model, all four cells measured:

|                     | small tree                     | large tree                                     |
| ------------------- | ------------------------------ | ---------------------------------------------- |
| **below threshold** | 0%                             | ~1% idle — 829 MB, 87,792 nodes                |
| **above threshold** | 0.7–2.9% — 1,591 MB, 698 nodes | **54–103% sustained** — 2,581 MB, 87,792 nodes |

Per-warmed-workspace cost, from the growth experiment (the same real journal
planted into eight workspaces, warmed one at a time): **~15,000 DOM nodes,
~400,000 WebKit malloc allocations, ~150–220 MB each.** That extrapolates onto
production almost exactly — ~2.6M allocations predicted against 2,688,616
measured.

**Retention is absolute, and memory is never returned.** Parking on another
workspace releases nothing; `closeWorkspace` releases nothing (it only sets
`closedAt`); only `deleteWorkspace` frees the DOM. And even after freeing _every_
transcript — document back to 698 nodes — the footprint plateaued at ~1,570 MB
against a fresh process's 23 MB. Roughly 195 MB per transcript is held forever.
Partial reclaim lands within ~75 s and then stops; four further minutes moved
nothing. **Only process exit reclaims it.**

This is why the fix must target factor 2. Releasing a hidden dock's DOM works not
because it frees memory — it does not — but because it shrinks the tree each
pressure event has to re-lay-out. Confirmed: at 698 nodes and 1,591 MB, sitting
inside the pressure band, idle CPU is 0.7–2.9% and a document-wide invalidation
costs 52 ms.

**It also explains the previously-unattributed 12–13 s freezes** recorded below:
those were pressure-driven document-wide relayouts of a (rig-inflated) 672,880-node
tree, not anything to do with switching.

## Motivation

Silo exists to keep every project alive at once. A user with several workspaces,
each running a coding agent, is the target case — and it is exactly the case
where this degrades. Measured on real journals (2026-09-16):

- The largest live session journal is **28 MB / 7,620 updates** (625 tool calls,
  3,014 agent message chunks, 48 user turns). Nothing caps it.
- **26 individual journal lines exceed 200 KB.** ~~A tool result that size renders
  through `renderDiff`, which emits 3 DOM nodes per changed line with no
  truncation — a handful of entries can dominate the whole panel's node count.~~
  **Corrected 2026-09-17:** this does not follow. The censused 27 MB session
  renders to 14,826 nodes total, of which diffs are 47%. `diffLines` trims the
  common prefix _and_ suffix before diffing, so even an agent rewriting a
  1,303-line file emits ~165 rows. Large journal _lines_ are mostly tool-result
  text, which does not create nodes proportionally.
- `seedFromJournal` folds the entire journal on every panel restore. There is no
  windowing, no tail read, no cap.
- `CenterDock` keeps every warmed workspace's dock mounted at
  `visibility: hidden` — deliberately, to avoid xterm refits — so N workspaces'
  transcripts occupy the layout tree simultaneously.

The React layer is **not** the problem and should not be the target of further
work: `TranscriptTurn` is memoized on `sameTurn`, `TranscriptRow` on entry
identity, and markdown is memoized on its text. That work is done and it does not
help, because the cost is the browser's layout and paint of a large DOM, which
memoization cannot touch.

### The identity defect

`applyUpdate` already tracks stable, agent-assigned identity — it matches tool
updates by `toolCallId` and merges message chunks by `messageId`. It then throws
that away at the point it matters: `appendEntry` stamps `e${seq}`, a counter over
fold order, and `groupTurns` keys turns `t${index}`.

That is not a cosmetic problem, because a restored panel folds the transcript
**twice**. The instant-paint seed reads the journal directly; the connect effect
then paints `handle.journal` — and on a `session/load` those are genuinely
different data, because the agent's replay streams into the same writer that was
seeded with `priorLines`. If the second fold merges chunks even slightly
differently, **every key after the divergence shifts** and React tears down and
rebuilds the entire transcript DOM.

Consequences, all currently paid:

- The rebuild momentarily shortens the scroller, the browser clamps `scrollTop`,
  and the position is lost. `isClampedScroll`, `SCROLL_RESTORE_SETTLE_MS`,
  `SCROLL_RESTORE_TIMEOUT_MS`, `SCROLL_RESTORE_GUARD_MS` and a per-frame retry
  loop exist to survive this. The comment at `scroll.ts` names the cause exactly
  and then treats it as weather rather than a bug.
- **Anchoring has nothing dependable to name.** Position must therefore be an
  absolute pixel offset — and an absolute offset is the one thing a windowed list
  cannot honestly provide. This, not implementation difficulty, is what blocks
  virtualization.

  Worth stating precisely, because it bounds the fix: keys are assigned **only**
  in `appendEntry`, and every subsequent mutation spreads `...prev` (the tool
  in-place replace, the chunk merge, `closeDanglingTools`). So within one fold
  lineage keys never shift. The instability is entirely the **one-time seed →
  replay swap** on restore. `groupTurns` is the exception — it re-derives
  `t${index}` positionally on every call, so a turn key really does move if an
  earlier turn appears or disappears.

- `applyUpdate` does `entries.findIndex` per tool update — O(n) per update,
  quadratic in session length. The 28 MB session costs millions of comparisons
  just to seed.

### Measured cost (2026-09-16) — SUPERSEDED, rig-derived

> **The node counts and the conclusions drawn from them in this section are
> unreliable.** They come from the pre-fix `transcript-gen.mjs`, which overstated
> transcript DOM by ~20× per turn (see "Revision 2026-09-17"). The `setActive`
> finding and the before/after fix numbers still stand — those are switch
> timings, not node counts. Kept for the record; do not plan against the table.

Measured against a synthetic transcript of the same shape as the real 28 MB
session, using the load-test rig in `scratchpad/transcript-load/` (a fake ACP
agent that refuses `session/load`, so the panel paints a planted journal in
journal-only mode). Jank is the longest `requestAnimationFrame` gap around a
workspace switch — i.e. how long the UI is frozen. Three switches per rung.

**All rows below already include the `setActive` fix (#544).**

| turns | DOM nodes | diff lines | switch freeze                    |
| ----: | --------: | ---------: | -------------------------------- |
|     6 |    78,977 |     25,635 | ~150 ms                          |
|    24 |   291,329 |          — | ~500–640 ms                      |
|    48 |   672,880 |    220,068 | ~1.2–1.4 s, plus 12–13 s freezes |

Two things this establishes.

**The `setActive` detach was the dominant term, and it is already gone.** At 6
turns, the same switch measured **2,722 / 2,650 / 2,672 ms** without the fix
versus **140 / 149 / 157 ms** with it — 17×. At 48 turns without the fix the app
locked up hard enough that the automation bridge stopped answering a trivial DOM
query inside its 5-second budget. Re-tearing-down a 672,880-node subtree on every
workspace activation was costing more than rendering it.

**What remains is still disqualifying at real sizes.** With the fix, switch cost
is roughly linear in node count up to 24 turns, then something superlinear
appears: at 48 turns the transcript also produces recurring **12–13 second**
main-thread freezes unattributed to any switch. A real session is ~2× this
fixture. 48 turns is 672,880 nodes for _one_ transcript — and `CenterDock` keeps
every warmed workspace's dock in the tree.

The 12–13 s freezes are **not yet attributed**; they are the first thing to
profile when step 4 lands, since per-entry caps may remove their cause outright
(220,068 diff lines is 3 nodes each, and `renderDiff` is uncapped).

### Scope note

The workspace-switch transcript _flash_ was a separate bug with a separate cause
(a redundant `setActive()` detaching the panel's DOM) and is fixed independently
in #544. It is not part of this proposal — but as the measurements above show, it
was also the single largest performance term, so the numbers here are the cost
that survives it. What remains is genuine: DOM size and the memory behind it.

## Design

> **Revised 2026-09-17.** A new step 0 is now the primary lever, and step 4 is
> demoted from "land first" to "probably not worth doing" — both on measurement.
> Steps 1–3 are unchanged and still sequenced 1 → 2 → 3.

### 0. Release a non-visible workspace's dock from the render tree

**This is the lever.** The symptom is driven by the size of the whole document's
render tree when WebKit's pressure handler fires, and that tree is N ×
per-warmed-workspace. Bounding one transcript cannot fix a total that is N × of
everything; releasing the N−1 docks the user is not looking at can.

Two pieces, in increasing difficulty:

- **`closeWorkspace` should actually tear down.** Today it sets `closedAt` and
  nothing else, so a user who closes a workspace to reclaim resources reclaims
  precisely zero — measured: 60,130 nodes before, 60,189 after closing two of
  four. This is the cheapest honest win, it matches what the action already
  implies to a user, and it needs no new machinery.
- **Unmount a warmed dock's DOM when it is not visible**, rebuilding from
  persisted panel state on re-activation.

The second piece is where the real work is, and this RFC does not yet have a
design for it. The open problem is that `CenterDock` retains every warmed dock
specifically to avoid xterm refits, and `scroll.ts` depends on the panel never
remounting. Neither obstacle has been re-examined against the two-factor model —
in particular, steps 1 and 2 below remove the scroll fragility that makes a
remount painful, which may change the calculus entirely.

Note what this does **not** do: it does not reduce process footprint. The memory
is never returned (~195 MB retained per transcript, forever). A long session
therefore still drifts toward the pressure threshold, and a very long one will
still want a webview reload. This step stops the threshold from _hurting_, which
is what actually matters.

### Steps 1–4

1–3 are one coherent sequence; 4 is independent.

### 1. Stabilise entry identity across the seed → replay swap

Message entries do **not** need a durable global id, and the journal format does
not need to change. Because keys are already stable within a lineage (above), the
only thing to fix is the single point where a lineage is discarded:

- **Tool entries** key on `toolCallId` — agent-assigned, stable across any
  replay, already matched on. Adopt it as the key; it is free and makes the
  reconciliation below exact for the majority of entries.
- **Turn keys** derive from the turn's user-message key instead of `t${index}`,
  removing the one place a key genuinely moves mid-lineage.
- **The second fold reconciles instead of replacing.** Today the connect effect
  does `setTranscript(emptyTranscript)` and then
  `setTranscript(seedFromJournal(handle.journal))`, discarding every entry object
  and with it every key. Instead, fold the replay and diff it against the current
  transcript, reusing the existing entry object wherever content matches. Equal
  conversations then produce zero DOM churn; a genuinely different replay (the
  `dropSeed` path, where the agent's replay is authoritative and the seed lines
  are dropped) still replaces what actually differs, which is correct.

Replace the `findIndex` with a `Map` from `toolCallId` to index in the same pass —
independent of keying, and it removes the quadratic term.

This is a smaller change than durable ids and does not touch persistence. It is
also what makes the height cache in step 3 viable, since that cache is keyed by
entry identity.

### 2. Make scroll position an anchor

Replace the persisted `{ top, pinned }` with
`{ anchorKey, offsetWithinAnchor, pinned }` — "entry X was at the top of the
viewport, Y pixels into it."

Restore becomes: find the element for `anchorKey`, scroll it into view, adjust by
the offset. Once. Content above changing height stops mattering; clamping stops
mattering; there is nothing to retry.

This deletes the rAF retry loop, all four timing constants, and `isClampedScroll`.
Removing the per-frame `scrollTop` write/read on a large scroller is also a direct
win on switch latency, independent of everything else.

`pinned` is retained as-is — "follow the stream" is still the right restore for a
transcript the user left at the bottom.

### 3. Window the transcript, preserving scroll-back-forever

**Decided: scrolling back through an entire conversation must keep working**, so
this is true windowing with height-estimating spacers, not a bounded
"load earlier" window. Only reachable after 1 and 2, because it needs
anchor-relative position to stay honest and stable keys to cache heights against.

Shape:

- Render only the turns intersecting the viewport (plus overscan). Everything
  above and below is represented by spacers.
- Maintain a **measured-height cache keyed by entry key** — which is exactly what
  step 1 makes dependable. A turn that has been on screen once contributes its
  real height; unmeasured turns contribute an estimate, corrected as they are
  measured.
- Because the entry list stays complete in memory, scroll-back is instant and the
  DOM stays bounded. `scrollHeight` is estimate-driven, which is precisely why
  step 2 must land first: an anchor is unaffected by an estimate being wrong,
  where an absolute offset is not.

Deliberately **not** in scope: bounding the journal seed. It conflicts with
scroll-back-forever unless earlier entries are paged back in from the journal on
demand. That is a real follow-up for memory (a 28 MB session is 28 MB of folded
objects per warmed workspace), but DOM is the dominant cost and this step does not
depend on it.

### 4. Cap per-entry cost — demoted; probably not worth doing

> **Revised 2026-09-17: measured, and it does not pay.** Originally "land it
> first for immediate relief," on the assumption that a few huge entries dominate
> the node count. They do not.

Built as a throwaway PoC (a 20-line cap on inline diffs, branch
`poc/chat-history-window`, stashed). On the _rig_ it looked spectacular —
87,271 → 5,073 nodes, document-wide relayout 390 ms → ~50 ms. On a **real**
transcript it takes 14,826 → ~9,000 nodes, which changes nothing: at that size
the relayout is already cheap and the process is nowhere near the threshold.

Two implementation traps found, for whoever revisits it: `ToolDiffBlock` is used
on both the inline path _and_ inside the explicitly-expanded tool body, so a
naive cap forces a second click on a diff the user already asked to see; and
truncating from the top is wrong for a diff — you get the removed side with the
additions hidden.

Also measured and rejected: **hunk-splitting `diffLines`** (emitting one hunk per
changed region, git-style, instead of one spanning first-to-last change). It
would save **1.6–5.8%** across three real sessions, because the existing
prefix/suffix trim already does that job.

The one genuinely unbounded path remains: `showInlineDiff` (tools with
`kind === "edit"`) renders its diff _outside_ the collapse guard with no cap. Worth
a defensive cap at a high threshold as a backstop against a pathological single
entry — not as a performance measure.

## Alternatives considered

- **Virtualize first, fix identity later.** The obvious move, and the one
  originally proposed. It fails: with positional keys and absolute-offset scroll
  restore, windowing makes `scrollHeight` an estimate and breaks position restore
  in exactly the way the existing retry machinery was built to paper over. It
  would add a second layer of compensation on top of the first.
- **`content-visibility: auto` on turns.** One CSS line, and the browser skips
  layout and paint for off-screen turns. Rejected as a first move for the same
  reason: `contain-intrinsic-size` makes `scrollHeight` estimate-driven, colliding
  with offset restore. Worth revisiting _after_ step 2, when position no longer
  depends on absolute height. WKWebView support needs checking.
- ~~**Unmount background workspaces' transcripts.** Targets the N-workspace
  multiplier directly, but relocates the cost to the switch back and fights the
  invariant that the panel never remounts (which `scroll.ts` depends on). Fixing
  the base cost makes the multiplier stop mattering; fixing the multiplier alone
  does not.~~

  **Reversed 2026-09-17 — this is now step 0, the primary lever.** The last
  sentence had it exactly backwards. There is no "base cost" to fix: a real
  transcript is 14,826 nodes and costs 52 ms to relayout, which is fine. The
  multiplier _is_ the problem — eight warmed workspaces reach 120,000 nodes and
  2.2 GB, and only then does the pressure handler's document-wide invalidation
  become ruinous. Fixing the multiplier is the only thing that works; there was
  never a base cost worth fixing.

  This also matches what the competition does. VS Code destroys hidden webviews
  by default (`retainContextWhenHidden: false`) on the explicit grounds that
  retaining them "has high memory overhead," persisting state via
  `getState`/`setState` instead — it keeps work alive by serializing state, not by
  retaining DOM. Zed has the same bug Silo does
  ([zed-industries/zed#46959](https://github.com/zed-industries/zed/issues/46959),
  S1: a long agent session degrades the whole editor and "persists after closing
  the panel"), _despite_ a native GPU renderer with virtualized scrolling — which
  is direct evidence that virtualizing the view is not sufficient on its own.
  Cursor has it too, acknowledged and unfixed.

- **One WebContent process per workspace.** The complete fix for factor 1, since
  process exit is the only thing that reclaims WebKit's memory, and it is what VS
  Code gets for free from its webview/iframe model. Out of scope here: it is an
  architectural change to the host, not a Chat-panel change. Worth its own RFC if
  step 0 proves insufficient.
- **Cap the journal on disk.** Discards user data to solve a rendering problem,
  and the journal is the durable record a session is resurrected from (RFC 0042).
  Bounding what is _read_ achieves the same result without losing anything.

## Decision

Accepted 2026-09-16. Both open questions are closed.

**Scroll-back-forever is a requirement** (Dave, 2026-09-16). Step 3 is therefore
true windowing with height-estimating spacers; the simpler bounded-window /
"load earlier" shape is rejected, and bounding the journal seed drops out of
scope with it.

**Message entries do not need a durable global id**, and the journal format is
unchanged. This reverses the proposal's first draft, on evidence: entry keys are
assigned only in `appendEntry` and every mutation preserves them, so identity is
already stable within a fold lineage. The only break is the one-time seed →
replay swap, which is fixed by reconciling the second fold against the first
rather than replacing it — plus adopting `toolCallId` for tool entries and
deriving turn keys from the user message. A restored anchor that cannot be found
after a genuinely divergent replay falls back to `pinned`/bottom, which is
strictly better than today's five seconds of retrying an unreachable offset.

~~Sequencing: **4 first** (independent, immediate relief), then **measure again**
before committing to 1–3 — the per-entry caps may move enough of the cost to
change what 3 needs to be. 1 → 2 → 3 in order after that; each is a hard
prerequisite for the next.~~

## Decision — superseded 2026-09-17, needs re-acceptance

The 2026-09-16 decision above rests on rig-derived node counts and on the premise
that one transcript's DOM is the cost. Both are wrong. What survives and what
changes:

**Survives unchanged.** Scroll-back-forever as a requirement. The finding that
entry ids need not be durable and the journal format need not change. The whole
identity analysis — keys assigned only in `appendEntry`, the one-time seed →
replay swap being the only break, `groupTurns` re-deriving positionally. The
quadratic `entries.findIndex`. These stand on their own merits regardless of the
performance story.

**Changes.**

- **Step 0 (release non-visible docks) is the primary lever**, replacing step 4
  as the thing to do first. It is also the one part of this RFC with no design
  yet, and the `CenterDock` xterm-refit constraint is the open problem.
- **Step 4 is demoted to a defensive backstop**, measured as ineffective on real
  transcripts.
- **Step 3 (windowing) is no longer urgent.** It bounds one transcript, which is
  not the cost. It remains the right eventual shape for very long sessions and is
  still gated on 1 and 2 — but it should not be planned as the fix.
- **Sequencing:** `closeWorkspace`-actually-releases first (cheap, independent,
  immediately useful), then 1 → 2 (which remove the scroll fragility that makes a
  dock remount painful), then design step 0's unmount properly with that
  fragility gone. Re-measure before committing to 3.

Suggested re-scope: this RFC is now trying to be two proposals. The identity and
scroll-anchor work (1–2) is a self-contained correctness change and could be
accepted as-is. The retention work (step 0) is a host/`CenterDock` concern that
may deserve its own RFC, since it is not really about chat transcripts at all —
they are just the largest thing a warmed workspace happens to hold.

Evidence for all of the above: `scratchpad/transcript-load/FINDINGS.md`.
