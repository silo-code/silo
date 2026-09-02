# Design — 0031 phase 2. Cross-workspace view + Tasks app sheet

Phase 2 only. Phase 1's design is the baseline (`providers/silo/`, the core
`Task` schema, detail-section descriptors, the `source-set` store, the side
panel). Working artifact — removed at collapse; durable pieces move into the
collapsed proposal or an ADR.

## Architecture

All implementation is in `silo-code/silo-extensions`, `tasks/`, except a possible
`@silo-code/sdk` + host change (see [SDK dependency](#sdk-dependency-workspacedir)).

Phase 1's module layout is unchanged; phase 2 adds files, it does not
restructure:

```
tasks/src/
  model/            (unchanged)
  lib/
    view.ts         + a cross-source grouping path
    prefs.ts        + the aggregated-surface prefs key
  providers/silo/   (unchanged — reused verbatim)
  sources/
    source-set.ts   → resolves N workspace sources, not 1; multi-consumer
  ui/
    TasksPanel.tsx      (unchanged side panel)
    CrossTasksView.tsx   NEW — Navigator view body
    TasksAppSheet.tsx    NEW — sheet body
    AggregatedList.tsx   NEW — shared list+toolbar+drill-in shell both use
    TaskList.tsx / TaskRow.tsx / TaskDetail.tsx / DetailSections.tsx / glyphs
                        (reused unchanged)
  index.ts          + registerNavigatorView, + silo.tasks.open, + nav toolbar items
```

The load-bearing idea: **one `source-set`, three views**. Phase 1 already put
the store in `activate` and documented this as its phase-2 payoff. Phase 2 cashes
it in — no new store, no per-surface data ownership.

## Components

### `source-set` — from 2 sources to N+1

Today `resolveSources()` returns the global source plus (if a workspace is
active) the active workspace's. Phase 2:

- One `await ctx.storage.workspaceDirs({ create: false })` call resolves a
  directory for every workspace in `ctx.workspaces.getState().open`; build a Silo
  source per entry — id `hashLocator("silo", locator)`, `scope: "workspace"`,
  `workspaceId`, `name` from the matching `Workspace`, `locator:
  <dir>/tasks.jsonl`. (Option B: the same loop over `resolveWorkspaceTasksDir(w)`.)
- Keep the global source first.
- Re-run resolution on `ctx.workspaces.subscribe` (already wired) — now it reacts
  to **any** open/close, not just an active-id change.
- `syncWatches` already diffs live vs. watched source ids and adds/removes
  watches; it needs no change beyond receiving the larger set.
- Per-workspace resolution errors: catch per iteration, emit the source with an
  `error` marker and an empty list, log via `ctx.log.error`, continue. The
  existing single `error: string | null` on `SourceSetState` becomes
  insufficient — move the error onto the per-source entry (`TaskSource.error?:
string` or a parallel `errorsBySource` map) so one bad workspace doesn't blank
  the whole model. The side panel keeps showing only global + active, so its
  behavior is unaffected.

The side panel keeps a **filtered read**: it selects the global source and the
active workspace's from the full set (it already knows `ws.activeId`), so its
UI is unchanged. The two new surfaces read the whole set.

Watch cost: one directory watch per open workspace. At a realistic ceiling
(dozens of workspaces) this is fine — the phase-1 watch is a debounced
directory watch, not a poll. If it ever isn't, the fallback is to watch only
sources with at least one mounted consumer; not built now.

### `CrossTasksView` — the Navigator view

```ts
ctx.registerNavigatorView({
  id: "silo.tasks.cross",
  title: "Tasks",
  icon: <ListChecks />,          // Phosphor, matching first-party view icons
  order: 20,                      // after Workspaces (0) and Agents (10)
  component: ({ active }) => <CrossTasksView paused={!active} ctx={ctx}
    sourceSet={sourceSet} prefsStore={prefsStore} bridge={crossBridge} />,
});
```

- Body is `<AggregatedList>` (below).
- `active === false` → pass `paused` so the list throttles re-renders while off
  screen (phase-1 panels already do this via `SidePanelProps.active`).
- Header actions are **toolbar items on the `"navigator"` surface**, scoped with
  `when: (ctx) => ctx.activeView === "silo.tasks.cross"` (ADR 0038 — one view,
  controls are toolbar items, not a second view): `Group by ▾`, `Filter ▾`,
  `Sort ▾`, and `New task`. Search is inline in the body, as in the side panel.

### `TasksAppSheet` — the dock sheet

```ts
ctx.registerCommand({
  id: "silo.tasks.open",
  label: "Tasks: Open Tasks app",
  run: () => {
    if (sheetOpen) return ctx.layout.revealSidePanel(PANEL_ID); // re-reveal
    sheetOpen = true;
    void ctx.layout
      .openPanelSheet(PANEL_ID, (close) =>
        <TasksAppSheet ctx={ctx} sourceSet={sourceSet}
          prefsStore={prefsStore} bridge={sheetBridge} onClose={close} />,
        { title: "Tasks", width: 720, mode: "push" })
      .finally(() => { sheetOpen = false; });
  },
});
```

- `mode: "push"` narrows the dock so the sheet takes real layout space — it is a
  workbench surface, not a transient popover.
- `bare: false` — the sheet keeps the host header (a title and the host's close
  affordance); the body is `<AggregatedList>` with a `sheet` density flag if the
  wider width warrants a roomier row (decide during build; default is identical
  rows).
- Non-modal is guaranteed by `openPanelSheet` itself (no scrim, Escape inert).
  `Escape` inside `<AggregatedList>` still pops a drill-in page — same handler
  the panel uses.
- A single-instance guard (`sheetOpen`) — `openPanelSheet` has no singleton
  option, so the command tracks it.

### `AggregatedList` — the shared shell

The one new UI unit both surfaces mount. Props: `ctx`, `sourceSet`,
`prefsStore`, `bridge`, `paused?`, `density?`. Responsibilities:

- `useServiceState(sourceSet)` → the full `sources` + `tasksBySource`.
- Flatten to `Task[]`, run `buildView(tasks, sources, prefs)` with the
  aggregated prefs.
- Render group headers + `TaskList` / `TaskRow` (reused).
- Own the drill-in stack (`bridge.drillTo`, `Escape` pops) — identical logic to
  `TasksPanel`, extracted into a shared hook (`useDrillStack`) so there is one
  copy. `TasksPanel` adopts the hook in the same change (small refactor, keeps
  R5 "no forked copy" honest).
- Inline `SearchInput`.

The side panel's quick-add stays panel-only for phase 2 — creating into "the
active workspace" from a cross-workspace surface is the "new tasks go to"
question, which is **phase 3**. The `New task` toolbar action in the Navigator
view reveals the side panel and focuses quick-add (the phase-1 command
behavior), so nothing regresses and no destination picker is introduced early.

## Data flow

1. `activate` → `createSourceSet(ctx, providers)` → `start()` resolves global +
   every open workspace, loads each list, opens one watch each.
2. `ctx.workspaces` change → `resolve()` re-runs → sources added/removed, watches
   synced, `commit()` emits a new `SourceSetState`.
3. External file change → per-source watch fires → `loadSource` → `commit`.
4. Any surface's mutation → `sourceSet.updateTask(...)` → provider writes that
   source's file → `loadSource` → `commit` → all mounted surfaces re-render.
5. Navigator view / sheet read the full `sources`; side panel reads its
   two-source filtered slice. All three run the same `buildView`.

## APIs / interfaces

### SDK dependency — resolving other workspaces' storage dirs

**The one open decision, and its sequencing gate.** The cross-workspace view
needs the extension-storage directory for **every open workspace**, not just the
active one. The phase-1 `ctx.storage.workspaceDir()` resolves the active
workspace only, rejects with `NoWorkspaceError` otherwise, and **creates the
directory as a side effect** ("created on first call").

#### Option A (recommended) — extend `ctx.storage` in `silo-code/silo`

Two additions to the existing `ExtensionStorageScopes` interface:

```ts
// existing method, two new optional params — fully backward compatible
workspaceDir(
  workspaceId?: string,
  options?: { create?: boolean },
): Promise<string>;

// new: one call resolves a path for every open workspace
workspaceDirs(
  options?: { create?: boolean },
): Promise<{ workspaceId: string; dir: string }[]>;
```

- **`workspaceId`** — omitted = the active workspace (today's behavior,
  `NoWorkspaceError` when none). Passed = that workspace's dir, active or not.
- **`options.create` defaults to `true`.** This is not a style choice — phase 1's
  own `file-store` writes via `files.writeText(tmpPath, …)` into the
  `workspaceDir()` result and never calls `createDir`, relying entirely on
  `workspaceDir()` having made the directory. `writeText`'s contract is "creating
  or overwriting **it**" — no parent creation (only `writeBytes` documents
  `mkdir -p`). So `create: false` as the default would break every existing RFC
  0032 writer, the Tasks extension included, with ENOENT on the tmp write.
  `create: false` is opt-in for callers that only want the path.
- **`workspaceDirs()`** resolves for every workspace in
  `ctx.workspaces.getState().open` in one host round-trip — no fan-out of N
  `workspaceDir(id)` calls. It carries the same `create` default (`true`), and
  the aggregation path passes `{ create: false }`: it only ever **reads** each
  `tasks.jsonl` (missing file → empty list, already handled in phase 1), and the
  write path still goes through the active-workspace `workspaceDir()` with its
  default `create: true`. No "which dirs already exist" filtering — knowing that
  buys nothing when you read all N regardless.

Cost: a `silo-code/silo` change (`@silo-code/sdk` + host), the `silo-docs-sync`
workflow, an `@silo-code/sdk` + app release, and the extension bumps its
`silo.engine` floor + `@silo-code/sdk` devDependency to match. `workspaceDir`'s
new params are on an existing `@public` method; `workspaceDirs` is one new method
on an existing interface (no new barrel export). `silo-docs-sync` scope: TSDoc +
`@category` on both, the hand-authored `ctx` storage member page, `pnpm docs:api`,
and a one-line roadmap note under the existing `ctx.storage` row. **No new
roadmap primitive, no ADR** — it does not move an architectural boundary.

Verdict: **recommended.** AGENTS.md — "if an extension needs a capability the SDK
lacks, add it to `ctx`", don't reach into internals.

#### Option B (fallback only) — derive the path in-extension

```ts
path.join(
  path.dirname(await ctx.storage.globalDir()),
  "workspaces",
  w.id,
  "tasks.jsonl",
);
```

No cross-repo work, ships immediately. Rejected as the primary plan: the SDK
documents that path shape as non-contractual ("always join onto the absolute
path you get back"). Acceptable **only** as a temporary bridge if Option A's
sign-off slips — behind a one-line helper (`resolveWorkspaceTasksDir`) whose body
is swapped for the `workspaceDirs()` call when A ships, leaving call sites
untouched — and then the coupling is noted as a known limitation in the extension
README.

#### Sequencing

Option A gates the phase: land the SDK change in `silo-code/silo` → release
`@silo-code/sdk` + app → bump the extension's pins → then build the phase-2
extension UI. Starting the UI against Option B's helper in parallel is allowed;
swapping to A later is a one-function change.

### Extension surface

- `ctx.registerNavigatorView` — used, not changed.
- `ctx.layout.openPanelSheet` — used, not changed.
- New command `silo.tasks.open`; new view id `silo.tasks.cross`; new
  `"navigator"`-surface toolbar items `silo.tasks.nav.group|filter|sort|new`.

## Persistence

- No new files, no schema change. Tasks stay in the phase-1 NDJSON, one file per
  source.
- `lib/prefs.ts` gains a `"cross"` workspace-key sentinel: `viewKey("cross")` →
  `"view:cross"`, alongside the existing `view:<id>` / `view:global`. The
  `PrefsStore` grows a `setSurface("panel" | "cross")` (or the Navigator/sheet
  instantiate a second `PrefsStore` bound to the `"cross"` key — decide during
  build; a second store instance is simpler and the store is cheap).
- Aggregated prefs live in `ctx.storage.global` — same bag, new key. Nothing in
  `SidePanelProps.storage` / `ctx.storage.workspace` (phase-1 correction).

## Error handling

- **One workspace fails to resolve or load** → that source renders as an errored
  row (a short "couldn't read this workspace's tasks" line, not a toast storm),
  other sources unaffected. Per-source error state on the model (see
  `source-set` above).
- **A workspace has an unparsable `tasks.jsonl` line** → phase-1 behavior per
  source: line preserved, one non-blocking notice naming the path, no re-notify
  while unchanged. With many sources, the notice names which workspace.
- **Sheet fails to open** (`openPanelSheet` rejects — no such panel id) → the
  promise rejects; `sheetOpen` is reset in `.finally`; log and a notify. Can't
  happen in practice (the panel id is registered in the same `activate`).
- **`workspaceDirs()` omits or errors one entry** → treat as that workspace's
  resolution failure (errored row), not a global fault. A `workspaceDirs()` call
  that rejects wholesale is a real fault — surface it like a phase-1
  `globalDir()` rejection.

## Testing strategy

Co-located Vitest, pure-logic style, `FileService` faked in-memory at the
`ctx.files` seam (phase-1 harness).

- `view.test.ts` — cross-source grouping: N workspace sources + global, grouped
  by source; single non-empty source collapses; `groupByStatus` / `groupByLabel`
  fan correctly across sources; a task filtered out appears in no group.
- `source-set.test.ts` — resolves N+1 sources for N open workspaces; a
  workspace with no file → empty source not an error; locator dedupe across
  worktrees; open a workspace → source appears, others' loaded state and watches
  intact; close a workspace → source and its watch gone, no leak; one
  `workspaceDirs()` entry missing/errored → that source errors, others load;
  deactivate → every watch disposed.
- `prefs.test.ts` — `view:cross` key round-trips; reading/writing it never
  touches `view:<id>` / `view:global`; the Navigator and sheet see the same
  aggregated prefs.
- `commands.test.ts` — `silo.tasks.open` opens the sheet once; a second call
  re-reveals rather than stacking; `silo.tasks.open` with no workspace open
  still opens (global-only).
- `boundaries.test.ts` — extended: `providerId` / `"silo"` absent under the new
  `ui/` files; `model/` + `lib/` gain no React/`ctx` import.
- `useDrillStack` — extract as a pure-ish hook with a tested reducer (push/pop,
  Escape pops one, never closes).
- If Option A: SDK-side unit tests — `workspaceDir("other-id")` resolves the
  right path; `workspaceDir()` with no args unchanged; `workspaceDir(id, { create: false })`
  returns the path and does **not** create the dir; `workspaceDir(id)` (default)
  still creates it; `workspaceDirs()` returns one entry per open workspace;
  `workspaceDirs({ create: false })` creates nothing; `engine-compat` gate test.

Manual runtime check (verifier-gui): two workspaces with tasks + a global list →
open the Navigator "Tasks" view, confirm all three groups; edit a task in
workspace B from the view while workspace A is active, confirm it persists;
open the Tasks app sheet, confirm same content and non-modal behavior; append a
line to workspace B's `tasks.jsonl` by hand, confirm it appears within ~0.5s.

## Constraints and existing decisions

- **ADR 0038** — the Navigator lists its views; register **one** view, controls
  are `"navigator"`-surface toolbar items scoped with `when`, and set an `icon`.
- **ADR 0026** — reach for the SDK design-system kit for content; the sheet and
  Navigator chrome (`openPanelSheet` shell, view header) stay host-owned.
- **ADR 0017 / theming** — extension CSS consumes design tokens only; the
  stylelint rule runs over the new CSS.
- **ADR 0021** — the Navigator view list is a roving-focus group; the view body
  relies on the shared `:focus-visible` ring.
- **ADR 0022 / RFC 0032** — task data is tier-1 user data reached only through
  `ctx.files` within the extension's own storage dir; `permissions: []` holds.
  Reading another workspace's dir is still inside the extension's own sandbox
  subtree — no new permission.
- **RFC 0031 durable proposal** — the LCD-core + descriptor seam, the
  `providerId`-never-in-`ui` health check, "a task's workspace is derived from
  its source, never stored", and "no ADR for the seam until a second aggregating
  surface adopts it" — **phase 2 is that second aggregating surface**; re-evaluate
  whether the seam now warrants an ADR (the durable proposal says to revisit at
  exactly this point). Recommendation: still no ADR — the second consumer is the
  same extension, not an independent one; note the re-evaluation in the collapse.
- **`docs/side-panel-design.md`** governs the side panel; the **sheet** follows
  `docs/modal-design.md` for content and its own non-modal chrome rules — check
  both working logs for updates in the same change.
- **`docs/domain-language.md`** — add **Tasks app** (the aggregated
  cross-workspace surface: the Navigator "Tasks" view and the dock sheet are two
  presentations of it) and, if useful, **aggregated view** vs the side panel's
  scoped view. Same change, per the domain-modeling workflow.
