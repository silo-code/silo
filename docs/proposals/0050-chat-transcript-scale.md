---
status: draft
created: 2026-09-16
---

# 0050. Chat transcript scale

## Summary

Silo degrades to ~2–11 fps once several workspaces have been used. It gets worse
the longer the app runs, a restart fixes it completely, and closing a workspace
does not help at all.

The cause is **not** the size of any one chat transcript. It is WebKit's
memory-pressure handler, and it needs **two conditions at once**:

1. **Process footprint above WebKit's memory-pressure threshold** — measured
   cliff between **1.5 GB and 1.8 GB**. This sets how _often_ a document-wide
   invalidation fires. Above the threshold, `MemoryPressureHandler` →
   `WebCore::releaseMemory(Critical, …)` →
   `LayoutIntegration::LineLayout::releaseCaches(RenderView&)` drops the style
   resolver and inline-layout caches, invalidating style and layout for the
   **entire document**, on WebKit's own timer, with no JavaScript involved.
2. **A large render tree in the document** — this sets what each invalidation
   _costs_: **390 ms** at 87k nodes against **52 ms** at 698. An ordinary
   _local_ invalidation is **4 ms** at any size, because WebKit is properly
   incremental. Only the document-wide ones are expensive.

Neither condition alone produces the symptom, which is why single-cause
explanations of it kept failing.

`CenterDock` keeps every warmed workspace's dock mounted at `visibility: hidden`
— which still participates in layout — so factor 2 is **N × per-workspace**, not
one transcript. Silo's premise, many workspaces alive at once, is what multiplies
it.

Factor 1 is effectively unfixable in-process: the memory is never returned.
Freeing _every_ transcript left the footprint at ~1,570 MB against a fresh
process's 23 MB, and only process exit reclaims it. **So this proposal attacks
factor 2: bound what a non-visible workspace keeps in the render tree.**

The first slice has shipped (#549, chat panels). The rest — the identity and
scroll-anchor work, and bounding non-chat content — is below.

## Motivation

Silo exists to keep every project alive at once. A user with several workspaces,
each running a coding agent, is the target case, and it is exactly the case where
this degrades.

### What a real session costs

Measured by planting the largest real journal on this machine (28 MB / 7,620
updates / 625 tool calls / 3,014 agent message chunks / 48 user turns) into the
panel and censusing the DOM:

|                                      | nodes      | share   |
| ------------------------------------ | ---------- | ------- |
| diff lines (2,321 × 3 nodes)         | 6,963      | **47%** |
| SVG icons (`svg` + `path`)           | 2,126      | 14%     |
| link / tooltip wrappers (767 × 2)    | 1,534      | 10%     |
| tool-call heads, titles, kind labels | ~1,550     | 10%     |
| markdown                             | 806        | 5%      |
| collapsed tool bodies                | **0**      | —       |
| **total**                            | **14,826** |         |

One transcript is ~15,000 nodes and ~150–220 MB, costing ~400,000 WebKit malloc
allocations. That is fine on its own. Four warmed workspaces is 60,000 nodes;
eight is 120,000 and 2.2 GB, which is past the cliff. The per-workspace figures
extrapolate onto production almost exactly — ~2.6M allocations predicted against
**2,688,616** measured.

### It is not JavaScript

Over 33 seconds of the live symptom, with `setTimeout`/`setInterval`/`rAF`
patched, every inline-style and `classList` write hooked, `ResizeObserver`
wrapped, every layout-reading getter instrumented, and a whole-document
`MutationObserver` running: **0 rAF frames, 0 layout reads, 0 ResizeObserver
callbacks, 1 DOM mutation** — while CPU swung to 90%. Three geometry snapshots of
11,122 elements, 2.4 s apart, were byte-identical. Layout is recomputed
continuously and produces the same answer every time.

The React layer is likewise not the target: `TranscriptTurn` is memoized on
`sameTurn`, `TranscriptRow` on entry identity, and markdown on its text. That
work is done and it cannot help, because the cost is WebKit re-laying-out a large
document that nothing in Silo dirtied.

Full evidence, including the 2×2 control that isolates memory from DOM size, is
in `scratchpad/transcript-load/FINDINGS.md`.

### Retention is absolute

| action                         | DOM nodes | footprint |
| ------------------------------ | --------- | --------- |
| 4 warmed, active on one        | 60,130    | 1,205 MB  |
| parked on a _light_ workspace  | 60,215    | 1,100 MB  |
| `closeWorkspace` on 2 of the 4 | 60,189    | 1,098 MB  |
| `deleteWorkspace` on those 2   | 30,367    | 1,059 MB  |

Being invisible releases nothing. **Closing releases nothing** — `closeWorkspace`
only sets `closedAt`, and `CenterDock` gates on the workspace existing, never on
`closedAt`. Only deletion frees the DOM, and even then the footprint barely
moves.

Churn is not the problem: twelve workspace switches left the node count constant
and the footprint flat. This is steady-state retention, not a leak.

### The identity defect

Independent of the performance story, and a prerequisite for windowing.

`applyUpdate` already tracks stable, agent-assigned identity — it matches tool
updates by `toolCallId` and merges message chunks by `messageId`. It then throws
that away at the point it matters: `appendEntry` stamps `e${seq}`, a counter over
fold order, and `groupTurns` keys turns `t${index}`.

That is not cosmetic, because a restored panel folds the transcript **twice**.
The instant-paint seed reads the journal directly; the connect effect then paints
`handle.journal` — and on a `session/load` those are genuinely different data,
because the agent's replay streams into the same writer that was seeded with
`priorLines`. If the second fold merges chunks even slightly differently, **every
key after the divergence shifts** and React tears down and rebuilds the entire
transcript DOM.

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

## Design

### 0. Bound what a non-visible workspace keeps in the render tree

The lever. Factor 2 is N × per-workspace, so bounding one transcript cannot fix a
total that is N × everything.

**0a. Chat transcripts — shipped in #549.** A Chat panel drops its transcript
rows 30 s after leaving screen and renders them again on return. The panel does
not unmount, so `transcript.entries` stays in memory: no re-seed, no second fold,
no identity churn. Measured with four warmed workspaces holding a real 27 MB
session:

| variant        | nodes when idle | switch cost        |
| -------------- | --------------- | ------------------ |
| before         | 60,257          | 0.44 s             |
| drop on hide   | 15,794          | **1.43 s** ❌      |
| **30 s grace** | **15,794**      | **0.17–0.24 s** ✅ |

The grace period is the whole trick: dropping on hide makes switching ~3× worse,
which is a bad trade in the one app whose premise is instant switching. The
rebuild cost only lands on a workspace returned to quickly — and those keep their
rows.

Two things learned there that generalise to the rest of step 0: the mount
decision must be **derived during render**, because an effect runs after paint
and flashes an empty frame; and the work belongs in the panel, not `CenterDock`,
because unmounting a dock forces an xterm refit — the very thing the warmed-dock
design exists to avoid.

**0b. `closeWorkspace` should actually release.** It sets `closedAt` and nothing
else, so a user who closes a workspace to reclaim resources reclaims zero. The
cheapest honest win, and it matches what the action already implies. A closed
workspace is one the user has finished with, so paying a remount on reopen is
correct — which is exactly the distinction the current code fails to make.

**0c. Non-chat content in a backgrounded dock** — editors, terminals, layers.
Not designed yet. This is where the xterm-refit constraint actually bites, and
steps 1–2 below remove the scroll fragility that makes a remount painful, so it
should be designed after them rather than now.

Note what step 0 does **not** do: it does not reduce process footprint. A long
session still drifts toward the threshold; this stops the threshold from hurting.

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

**No longer urgent.** Windowing bounds one transcript, which is not the cost —
step 0 already bounds the document to one transcript's worth regardless of how
many workspaces are warm. It remains the right eventual shape for a single very
long session, and it stays gated on 1 and 2.

Deliberately **not** in scope: bounding the journal seed. It conflicts with
scroll-back-forever unless earlier entries are paged back in from the journal on
demand.

## Measured and rejected

Recorded so they are not re-proposed. All measured against real journals, not the
load-test fixture.

- **Capping rendered diff lines.** Prototyped. Cuts the _fixture_ from 87,271 to
  5,073 nodes, but a real transcript only goes 14,826 → ~9,000, which changes
  nothing at that scale. Two traps for anyone revisiting: `ToolDiffBlock` is used
  on both the inline path and inside the explicitly-expanded tool body, so a
  naive cap forces a second click on a diff the user asked to see; and truncating
  from the top is wrong for a diff — you get the removed side with the additions
  hidden. Worth a defensive cap at a high threshold as a backstop against one
  pathological entry, not as a performance measure.
- **Hunk-splitting `diffLines`** (git-style, one hunk per changed region).
  Would save **1.6–5.8%** across three real sessions, because the existing
  prefix/suffix trim already does that job — even an agent rewriting a 1,303-line
  file emits ~165 rows.
- **`content-visibility: hidden` on background docks** and **`contain: layout
paint` on the scroller.** Both cut a forced full-document layout by ~350×, and
  neither helps: a pressure-driven cache drop invalidates style for _every_
  element, so every containment boundary is dirty and there is nothing to prune.
- **Collapsing tool calls harder.** Already conditional rendering, not CSS
  hiding — the census found **0** collapsed tool bodies in the DOM.

## Alternatives considered

- **Virtualize first, fix identity later.** Fails: with positional keys and
  absolute-offset scroll restore, windowing makes `scrollHeight` an estimate and
  breaks position restore in exactly the way the existing retry machinery was
  built to paper over. It would add a second layer of compensation on the first.
- **Cap the journal on disk.** Discards user data to solve a rendering problem,
  and the journal is the durable record a session is resurrected from (RFC 0042).
  Bounding what is _read_ achieves the same result without losing anything.
- **One WebContent process per workspace.** The complete fix for factor 1, since
  process exit is the only thing that reclaims WebKit's memory — and what VS Code
  gets for free from its webview/iframe model. Out of scope here: an
  architectural change to the host, not a Chat-panel change. Worth its own RFC if
  step 0 proves insufficient.

### What the competition does

VS Code **destroys hidden webviews by default** (`retainContextWhenHidden:
false`), explicitly because retaining them "has high memory overhead," and
persists state via `getState`/`setState`. It keeps work alive by serializing
state, not by retaining DOM — which is the same conclusion step 0 reaches.

Zed has this bug too ([zed-industries/zed#46959](https://github.com/zed-industries/zed/issues/46959),
severity S1: a long agent session degrades the whole editor, and it "persists
after closing the panel") **despite** a native GPU renderer with virtualized
scrolling. That is direct evidence that virtualizing the view is not sufficient
on its own. Cursor has it as well, acknowledged and unfixed.

## Decision

**Not yet accepted.** Step 0a shipped in #549 on its own merits — it is a
self-contained, measured win that does not depend on the rest. Everything else
needs a decision.

Two things worth settling before accepting:

- **This is arguably two proposals.** Steps 1–2 are a self-contained correctness
  fix (a quadratic `findIndex`, and a retry loop that exists to paper over a DOM
  teardown) and could be accepted as-is. Step 0b/0c is a host and `CenterDock`
  retention concern that is not really about chat transcripts — they are just the
  largest thing a warmed workspace happens to hold. Splitting may serve both
  better.
- **Scroll-back-forever was decided as a requirement** (2026-09-16), which is
  what makes step 3 true windowing rather than a bounded window. That decision
  stands, but step 3 is no longer urgent, so it should be re-confirmed when step 3
  is actually planned rather than assumed now.
