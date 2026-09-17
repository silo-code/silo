# Chat transcript performance — investigation (2026-09-17, second pass)

**Root cause found and confirmed.** This rewrite supersedes the first-pass
handoff. Two things changed: the mechanism is now known, and **the load-test rig
turned out to be unrepresentative of real transcripts by ~20×**, which
invalidates most of the DOM-size numbers the first pass (and RFC 0050's
motivation) was built on. Read the "Corrections" section before trusting any
node count you have seen before today.

## The symptom

With a long-running Silo, the app degrades to ~2–11 fps. The workspace holding a
large transcript does not need to be visible or open. Closing it does not help;
deleting it does. Reproduces in production.

## Root cause

**WebKit's own memory-pressure handler is the invalidator. Nothing in Silo is
dirtying layout.**

The chain:

1. The WebContent process's footprint crosses WebKit's memory-pressure
   threshold (measured cliff between **1.5 GB and 1.8 GB**; see the ladder
   below).
2. WebKit's pressure handler responds by dropping process-wide caches. Visible
   on the main thread in `sample`: `MemoryPressureHandler` →
   `WebCore::releaseMemory(Critical, …)` →
   `LayoutIntegration::LineLayout::releaseCaches(RenderView&)`, plus
   `releaseNoncriticalMemory` and a `GCController` code purge.
3. Those drops invalidate **style and inline layout for the entire document** —
   the one class of invalidation that is not incremental.
4. Rebuilding style + layout re-allocates those caches, the footprint climbs
   back, and the handler fires again. Self-sustaining, with zero JavaScript
   running.

### Evidence

**It is not JavaScript, and there is no per-frame invalidator.** A 33-second
census with `setTimeout`/`setInterval`/`rAF` patched, every inline-style and
`classList` write hooked, `setProperty`/`insertRule` hooked, `ResizeObserver`
wrapped, every layout-reading getter instrumented, and a whole-document
`MutationObserver` recorded: **0 rAF frames, 0 layout reads, 0 ResizeObserver
callbacks, 1 mutation, 24 no-op `classList.toggle('dock-has-focus')` calls** —
while CPU swung to 90%.

**Layout is not failing to converge.** Three geometry snapshots of 11,122
elements, 2.4 s apart: **0 elements changed**. Layout is recomputed and produces
byte-identical output.

**The driver is the async layout timer, not the rendering timer.** Sample `s1`
(10 s, JS idle, real bug state): 6,577 / 8,437 main-thread samples under
`WebCore::timerFired`, of which **5,770 are `LocalFrameViewLayoutContext::layout`
called straight off the shared timer** (i.e. something called `scheduleLayout()`)
and **761 are `Document::updateStyleIfNeeded`** off the style-recalc timer.

**The code purge leaves a fingerprint.** Sample `s0` has ~322 samples in
`CachedScript::script()` → `TextResourceDecoder::decodeAndFlush` →
`TextCodecUTF8::decode` — script _sources_ being re-decoded because compiled
code had been thrown away.

**Ordinary invalidations are cheap; document-wide ones are not.**

| invalidation                                                    | cost at 87–88k nodes |
| --------------------------------------------------------------- | -------------------- |
| local (body padding)                                            | **4 ms**             |
| document-wide (root font-size, or adding/removing a stylesheet) | **390 ms**           |

At 5,073 nodes the document-wide case is ~50 ms.

**The decisive control — a 2×2 isolating memory from DOM size.** Allocating
plain `ArrayBuffer`s in the page changes no DOM at all:

|                | light doc (506 nodes)   | heavy doc (87,792 nodes)         |
| -------------- | ----------------------- | -------------------------------- |
| low footprint  | 0%                      | ~1% idle (829 MB, fresh process) |
| high footprint | **0.7–2.9%** @ 2,251 MB | **54–103% sustained** @ 2,581 MB |

The bottom-left cell is the point: a light document at an _equal or higher_
footprint stays at ~1%. **Memory pressure alone is harmless; memory pressure plus
a large render tree is the bug.** Dropping the buffer reference on the heavy
document returned it to 0% immediately.

**The cliff, measured on the heavy document:** 1,508 MB → 0.6–5.4%;
**1,789 MB → 27.9%**; 2,581 MB → 54–103% sustained. (The WebKit threshold
constants are inference; the cliff location is measured.)

**Deleting the workspace:** 88,973 → 1,604 nodes, 52–110% CPU → **0% for ten
consecutive seconds**.

### Two things this explains

- **Why `contain: layout paint` did not stop the traversal.** Containment prunes
  layout scope for a _dirty subtree_. A pressure-driven cache drop invalidates
  style for **every** element, so every containment boundary is dirty and there
  is nothing to prune. Containment was never going to help against this
  invalidator.
- **Why closing a workspace does not help but deleting does.** `closeWorkspace`
  only sets `closedAt`; the DOM stays, so the memory stays. Deleting frees it.

## Corrections — read before trusting older numbers

### 1. The rig is unrepresentative by ~20× per turn

`transcript-gen.mjs` builds each Edit from **two independently generated random
code blocks** (`oldText: codeLines(n)`, `newText: codeLines(n + between(1,12))`).
They share no common prefix or suffix, so `diffLines`' prefix/suffix trim cannot
fire and **every line becomes an add or a delete**.

|                        | turns  | transcript nodes |
| ---------------------- | ------ | ---------------- |
| rig                    | 8      | **87,266**       |
| rig                    | 24     | ~291,000         |
| **real 27 MB session** | **48** | **14,826**       |

Per diff: the rig emits ~568 rendered rows; real edits emit **~19**.

**Every node count in the first-pass handoff (78,562 for a background dock;
291,329 at 24 turns; 672,880 at 48) is a rig number, not a real one.** The rig
needs fixing before it is used to justify anything — its edits should share a
common prefix and suffix the way real ones do.

### 2. Real transcripts do not build a pathological render tree

Census of the real 27 MB / 48-turn / 625-tool-call session (the same one RFC
0050's motivation cites), rendered in the panel via journal planting:

|                                      | nodes      | share   |
| ------------------------------------ | ---------- | ------- |
| diff lines (2,321 × 3 nodes)         | 6,963      | **47%** |
| SVG icons (`svg` + `path`)           | 2,126      | 14%     |
| link / tooltip wrappers (767 × 2)    | 1,534      | 10%     |
| tool-call heads, titles, kind labels | ~1,550     | 10%     |
| markdown                             | 806        | 5%      |
| **collapsed tool bodies**            | **0**      | —       |
| **total in scroller**                | **14,826** |         |

Whole document: 15,335 nodes on a **533 MB** process. Nowhere near the cliff.

### 3. Collapse already works — tool calls are not retained in the DOM

Both levels use conditional rendering, not CSS hiding. A collapsed tool's
`acp-chat__tool-body` is not rendered (`{expanded ? … : null}`), and a collapsed
tool-group renders only its last `TOOL_GROUP_INLINE_COUNT` (5) rows. Census
confirms **0** collapsed tool bodies in the DOM.

The one exception: `showInlineDiff` (tools with `kind === "edit"`) renders its
diff **outside** the collapse guard, uncapped. That is the only unbounded path —
but per §2 it is 47% of a 14.8k-node tree, not the 97.7% the rig suggested.

### 4. Ideas measured and rejected

- **Hunk splitting `diffLines`.** Would save **1.6–5.8%** across three real
  sessions. `diffLines` already trims the common prefix _and_ suffix, so even an
  agent rewriting a 1,303-line markdown file renders ~165 rows, not 1,300. Not
  worth building. (I argued for this before measuring it; it was wrong.)
- **Capping inline diff lines.** Implemented as a throwaway PoC on
  `poc/chat-history-window` (stashed). Cuts the _rig_ from 87,271 → 5,073 nodes
  and document-wide relayout from 390 ms → ~50 ms, but on a real transcript it
  only takes 14,826 → ~9,000, which changes nothing at that scale. Also had two
  bugs: it capped the explicitly-expanded path (forcing a second click on a diff
  the user asked to see) and truncated from the top rather than around the
  changes.
- Also still ruled out from the first pass: React re-rendering/memoization,
  StrictMode, the `setActive` detach (real, fixed in #544), `content-visibility`
  on background docks, `contain: layout paint` on the scroller, and both
  candidates the first pass named in `AcpChatPanel.tsx` — the autoscroll
  `useLayoutEffect` and the rAF scroll-restore loop. Neither ran at all during
  the 33 s census.

## The open question

**Where does production's memory actually go?**

Production Silo's WebContent: **3,134 MB total, 2,158 MB of WebKit malloc** —
genuinely above the cliff and genuinely slow. But the largest real transcript is
only 14,826 nodes / ~500 MB of process. So the transcript DOM is a contributor,
not the driver.

The strongest clue: **restarting the dev app cut the _same document_ from
~1,685–1,930 MB to 829 MB.** About a gigabyte of accumulated, unreturned memory.
That points at accumulation over a long session rather than steady-state
transcript size. Candidates, none yet measured:

- `CenterDock` keeps every warmed workspace's dock mounted at
  `visibility: hidden` — which still participates in layout (unlike
  `display: none`), so N workspaces' transcripts are all laid out. This part of
  RFC 0050's motivation holds.
- Monaco models/editors retained per workspace.
- Terminal buffers and xterm WebGL canvases.
- Repeated transcript churn through the journal writer, which holds every line
  of its session in memory.
- WebKit malloc not returning memory to the OS within a session.

### First breakdown (`vmmap -summary`, 2026-09-17)

|                                     | **prod** (long session, ~9 open workspaces) | **dev** (fresh, one real 27 MB transcript) |
| ----------------------------------- | ------------------------------------------- | ------------------------------------------ |
| physical footprint                  | **2.6 G** (peak **4.7 G**)                  | 479 MB (peak 814 MB)                       |
| WebKit malloc allocated             | **1.9 G** / **2,688,616** allocations       | 415.6 MB / 878,187 allocations             |
| malloc fragmentation                | 5%                                          | 10%                                        |
| graphics regions (`owned unmapped`) | **1,105** — 195 MB resident, 644 MB swapped | **49** — 27 MB                             |
| JS heap resident (Gigacage)         | 31.8 MB                                     | ~0                                         |
| JS JIT code resident                | 9.9 MB                                      | —                                          |

What this rules out and what it points at:

- **Not JavaScript.** A 31.8 MB resident JS heap cannot explain 2.6 GB. The
  entry model, journal lines, and xterm scrollback all live there.
- **Not fragmentation.** 5%.
- **It is object count.** 2.69 million live WebKit malloc allocations averaging
  ~740 bytes — DOM nodes, `RenderObject`s, `RenderStyle`s, line-layout boxes,
  `StringImpl`s. Prod has **3.1× the allocation count** and **4.6× the allocated
  bytes** of a dev instance holding one complete real transcript.
- **Graphics backing store is a large second bucket**: 1,105 regions vs 49, and
  ~800 MB resident+swapped. That is compositing layers and canvas backing —
  consistent with ~20 terminal session-hosts (each an xterm WebGL canvas) plus a
  docked layer per warmed workspace.

**So the memory is the multiplication, not one transcript.** `CenterDock` keeps
every warmed workspace's dock mounted at `visibility: hidden` — which still
participates in layout — with its transcripts, Monaco models, and terminal
canvases all live. Nine warmed workspaces × (transcript + editors + terminals)
reaches 2.6 GB, past the 1.5–1.8 GB cliff, and WebKit malloc does not return it
(peak 4.7 G).

This **vindicates the structural half of RFC 0050's motivation** (the
multiplication across warmed workspaces) while **invalidating its lever**
(windowing one transcript's DOM). Bounding one transcript cannot fix a total
that is dominated by retaining N of everything.

It also matches the competitor finding: VS Code destroys hidden webviews by
default (`retainContextWhenHidden: false`) precisely because retaining them "has
high memory overhead," and persists state via `getState`/`setState` instead. VS
Code keeps work alive by serializing state, not by retaining DOM and layers.
Silo currently does the opposite, in one document, one WKWebView, one memory
budget.

### Growth experiment (2026-09-17) — answered

The same real 27 MB journal planted into four workspaces, warmed one at a time.

**Marginal cost of warming one transcript workspace:**

| warmed | DOM nodes | WebKit malloc allocations | footprint |
| ------ | --------- | ------------------------- | --------- |
| 1      | 15,397    | 994,322                   | 548 MB    |
| 2      | 30,308    | 1,130,323                 | 982 MB    |
| 3      | 45,219    | 1,399,890                 | 774 MB    |
| 4      | 60,130    | 2,133,534                 | ~1,205 MB |

≈ **15,000 DOM nodes, ~400,000 WebKit malloc allocations, and ~150–220 MB per
warmed transcript workspace** (~26 allocations per DOM node — Element,
RenderObject, RenderStyle, StringImpl, line-layout boxes).

This extrapolates onto production almost exactly: baseline ~1M allocations plus
four warmed transcripts × ~400k ≈ 2.6M, against production's measured
**2,688,616**.

**Retention is total and permanent:**

| action                         | DOM nodes  | footprint |
| ------------------------------ | ---------- | --------- |
| 4 warmed, active on one        | 60,130     | 1,205 MB  |
| parked on a _light_ workspace  | **60,215** | 1,100 MB  |
| `closeWorkspace` on 2 of the 4 | **60,189** | 1,098 MB  |
| `deleteWorkspace` on those 2   | **30,367** | 1,059 MB  |

Being invisible releases nothing. Closing releases nothing (`closeWorkspace`
only sets `closedAt`). **Only deletion releases DOM — and even then the
footprint barely moves** (1,098 → 1,059 MB for 30,000 nodes freed), because
WebKit malloc does not return pages to the OS promptly. That is why a restart is
the only reliable reset.

**Churn does not accumulate.** Twelve workspace switches among the four: footprint
1,205 → 1,150 → 1,102 MB, allocations 2.13M → 2.08M → 1.83M, node count constant
at 60,130. It went _down_, not up.

> **Correction to an earlier claim in this document's history.** I previously
> cited "restarting cut the same document from ~1.9 GB to 829 MB — about a
> gigabyte of accumulated, unreturned memory" as evidence of leak-like growth.
> This experiment does not reproduce that from normal use. That earlier drop was
> most likely my own probing: repeated 700 MB `ArrayBuffer` allocate/free cycles
> and many HMR remounts of an 87k-node panel. **There is no leak-on-churn.**

### Does freeing DOM clear the pressure condition? (2026-09-17)

The decisive follow-up: eight workspaces warmed to **119,966 nodes / 2,181 MB**,
then freed, watching footprint over minutes rather than seconds.

|                                | DOM nodes | footprint              |
| ------------------------------ | --------- | ---------------------- |
| 8 warmed                       | 119,966   | 2,181 MB               |
| deleted 4, t+25 s              | 60,270    | 2,093 MB               |
| t+75 s                         | 60,270    | **1,793 MB**           |
| t+300 s                        | 60,270    | 1,785 MB (plateau)     |
| deleted **all**, t+60 s        | **698**   | 1,613 MB               |
| t+240 s                        | 698       | **1,578 MB** (plateau) |
| _fresh process, for reference_ | 270       | **23 MB**              |

**Memory is never returned.** With the document back to essentially empty, the
footprint plateaus at ~1,570–1,590 MB against 23 MB fresh — roughly **195 MB
retained per transcript, permanently**. Partial reclaim lands within ~75 s and
then stops dead; four further minutes moved nothing. Only process exit reclaims
it.

> **Correction to the correction above.** I said there is no leak-like
> accumulation. There _is_ — but it is a leak on **destroy**, not on churn.
> Switching between warmed workspaces costs nothing; destroying one retains
> ~195 MB forever. That is why a restart is the only reliable reset.

**But it does not matter, and this is the key result.** At **698 nodes and
1,591 MB** — sitting inside the pressure band — the app is fine: idle CPU
0.7–2.9%, and a document-wide invalidation costs **52 ms** (vs 390 ms at 87k
nodes). This is the same answer as the 2×2 control, and it means:

**You do not have to reclaim the memory. You only have to keep the render tree
small at the moment pressure fires.** Releasing a non-visible dock's DOM works
for that reason — not because it frees anything.

### Conclusion

The defect is **steady-state retention, not accumulation**. Silo holds every
warmed workspace's complete DOM for the life of the process, and ~4 warmed chat
transcripts is enough to cross WebKit's memory-pressure threshold — at which
point the pressure handler begins invalidating style and layout document-wide
every time it fires, which is ruinous against a 60,000-node tree.

The lever is therefore **how much a non-visible workspace retains**, not how
large one transcript's DOM is. Bounding one transcript cannot fix a total that is
N × everything. The two changes that would actually move it:

1. **Release a warmed dock's DOM when it is not visible**, rebuilding from
   state on re-activation — what VS Code does with hidden webviews
   (`retainContextWhenHidden: false`, with `getState`/`setState`). This is in
   tension with Silo's premise, but the premise is "keep the _work_ alive," and
   that does not require keeping the _DOM_ alive.
2. **Make `closeWorkspace` actually release.** Today it sets `closedAt` and
   nothing else, so a user who closes a workspace to reclaim resources reclaims
   nothing. That is the cheapest honest win and it matches what users already
   expect the action to do.

## The rig

- `fake-acp-agent.mjs` — minimal ACP agent over stdio. Refuses `session/load`
  and `session/resume` so a restore degrades to journal-only. `--turns N` streams
  a synthetic transcript right after `session/new` (no journal, no restart).
- `transcript-gen.mjs` — **known unrepresentative, see Corrections §1.**
- `gen-journal.mjs` / `plant.sh` — file-planting path. Needs the app stopped and
  a restart.

Streaming setup (no restart):

```sh
# profile `loadtest-fake` -> node fake-acp-agent.mjs --turns 8
openWorkspace -> activateWorkspace -> exec core.newAgent.loadtest-fake
```

**Planting a real journal** (what §2 used — far better than the generator):

```sh
# 1. create a journal-only session and read its id back
openWorkspace -> activateWorkspace -> exec core.newAgent.<bare-fake-profile>
listPanels                      # -> params.sessionId
# 2. stop the dev app (the journal writer rewrites the whole file on flush)
# 3. cp a real journal over the dev session's path
cp ~/.config/silo/workspaces/<ws>/chat-sessions/<sid>.jsonl \
   ~/.config/silo-dev/workspaces/<WS>/chat-sessions/<SID>.jsonl
# 4. restart, activate that workspace, wait ~60s for paint
```

Real journals live at `~/.config/silo/workspaces/*/chat-sessions/*.jsonl`
(dev: `~/.config/silo-dev/...`). 35 sessions on this machine; the largest is
27 MB.

## How to profile

```sh
ps -ax -o pid,%cpu,command | grep WebContent   # find Silo's
sample <pid> 8 -file /tmp/s.txt
footprint -p <pid>                             # per-subsystem memory
```

**Reach for `sample` first, not last.** It was the only probe that produced a
real answer, both passes.

Identifying Silo's WebContent is fiddly — there are usually 6–10 on this
machine. Match `etime` against the app process; do **not** pick by `%cpu` (it is
a lifetime average) or by sorting, which reliably grabs some other app's webview.

Measure CPU with a cumulative-time delta, not `top`:

```sh
secs(){ ps -p $WC -o time= | awk -F'[:.]' '{print ($1*60+$2)+$3/100}'; }
p=$(secs); sleep 10; n=$(secs); echo "$n $p" | awk '{print ($1-$2)*10"%"}'
```

## Gotchas that cost time

- **`requestAnimationFrame` is suspended when the window is not frontmost.** Any
  rAF-based fps probe returns garbage. Use a forced-layout timing probe instead.
- **The automation bridge's `eval` has a hard 5 s reply timeout, and the JS runs
  anyway.** **Never retry a mutating payload** — a retry loop resent one ~30
  times and cost ten minutes of drain time. Fire once, then poll with a cheap
  read.
- **The bridge also wedges at 0% CPU** after a timeout and needs ~20 s of
  polling to recover. That looks like the pending-reply state machine, not the
  perf bug.
- **Never leave a runtime style override installed.**
- Screenshots come back blank when the window is not frontmost.
- A DOM census taken right after an HMR edit can catch the panel mid-remount and
  report 0 nodes. Wait for CPU to settle and re-read the node count before
  trusting a measurement.

## What RFC 0050 needs

The RFC is `accepted` and its framing predates all of this. Two problems:

1. **Its motivation's node-count claims come from the rig.** "A tool result that
   size renders through `renderDiff` … a handful of entries can dominate the
   whole panel's node count" does not survive the real-journal census: the 27 MB
   session it cites renders to 14,826 nodes, diffs being 47%.
2. **Its central lever (windowing the transcript) targets DOM size, which is not
   the driver.** The driver is process footprint crossing WebKit's pressure
   threshold, and the transcript is only part of that.

What still holds: nothing in the pipeline is bounded, `seedFromJournal` folds the
whole journal on restore, and `CenterDock` keeps every warmed dock in the layout
tree. The identity/anchoring work it sequences first is independently sound.

Revise it after the production-memory breakdown, not before — otherwise the
revision will target the wrong thing a second time.
