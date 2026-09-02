# Requirements — 0031 phase 2. Cross-workspace view + Tasks app sheet

Behavioral spec for **phase 2 only**: the Navigator cross-workspace view and the
Tasks app dock sheet, both over the phase-1 Silo provider. Phase 1's shipped
behavior is the baseline and is not re-specified here. Working artifact — removed
when the phase collapses.

## R1 — Cross-workspace source resolution

The extension must resolve a Silo `TaskSource` for the global list and for
**every open workspace**, not only the active one, and load each source's tasks.

### Acceptance criteria

- [ ] With N open workspaces, the aggregated model exposes N + 1 sources (one per
      open workspace plus the global "Personal" source), each with its resolved
      task list.
- [ ] A workspace with no `tasks.jsonl` yet resolves to a source with an empty
      list, not an error and not a missing source.
- [ ] Two workspaces that are worktrees of the same repo and resolve to the same
      locator appear **once** (the phase-1 locator dedupe still applies).
- [ ] Closed workspaces contribute no source to the aggregated model.
- [ ] Opening or closing a workspace adds or removes its source within roughly a
      second, with no manual refresh and without dropping the other sources'
      loaded state or watches.
- [ ] Resolution failure for one workspace surfaces that workspace as an errored
      row and does not abort resolution of the others.

## R2 — Per-workspace freshness

An external change to any resolved workspace's `tasks.jsonl` (an agent or a
hand-edit appends a line) must be reflected in every surface showing that source
within roughly half a second, with no manual refresh.

### Acceptance criteria

- [ ] Each resolved source has exactly one directory watch (phase-1 rule: watch
      the directory, filter to the `tasks.jsonl` basename, debounced).
- [ ] The extension's own writes do not cause a reload loop (phase-1
      content-based self-write suppression still applies, per source).
- [ ] Watches are disposed when a workspace closes and when the extension
      deactivates; no watch leaks across a workspace open/close cycle.

## R3 — The Navigator cross-workspace view

The extension must register one Navigator view (`ctx.registerNavigatorView`)
titled "Tasks" that renders the aggregated task list.

### Acceptance criteria

- [ ] The view is listed in the Navigator's view list with a title and an icon
      (ADR 0038 — `icon` is load-bearing beside the first-party views).
- [ ] The view renders with **no workspace open** (global source only).
- [ ] Default grouping is by source, one group header per workspace plus the
      global list; a single non-empty source collapses to one unlabeled group
      (phase-1 `groupBySource` rule).
- [ ] `Group by`, `Filter`, and `Sort` are toolbar items on the `"navigator"`
      surface, scoped to this view via `when`, and drive the same `buildView`
      transformation the side panel uses.
- [ ] Search is available within the view (inline, matching the side panel's
      `SearchInput` placement conventions in `docs/side-panel-design.md`).
- [ ] A row uses the phase-1 vocabulary exactly: status glyph · title · priority
      mark, **no task id**, **no provider name**.
- [ ] Selecting a row drills into the phase-1 `TaskDetail` page; `Escape` pops
      one page and never closes the Navigator; the drilled-into task is not
      persisted across a restart.
- [ ] Edits made from the drill-in (title, lane, priority, labels, description,
      due date, acceptance criteria) persist to that task's own source file and
      are reflected in every other surface showing it.

## R4 — The Tasks app dock sheet

A command must open a dock-anchored, non-modal sheet
(`ctx.layout.openPanelSheet`) presenting the same aggregated list in a wider,
full-height layout.

### Acceptance criteria

- [ ] `silo.tasks.open` opens the sheet anchored to the tasks side panel's dock,
      revealing that panel first (the documented `openPanelSheet` behavior).
- [ ] The sheet is non-modal: no scrim, the rest of the workbench stays
      interactive, and `Escape` does not close the sheet (it pops a drill-in
      page, matching the panel).
- [ ] The sheet shows the same sources, grouping, filtering, sorting, search, row
      vocabulary, and drill-in detail as the Navigator view — one shared view
      model, not a re-implementation.
- [ ] The sheet renders with no workspace open.
- [ ] `silo.tasks.open` with the sheet already open focuses / re-reveals it
      rather than stacking a second sheet.
- [ ] Closing the sheet leaves the Navigator view and side panel untouched and
      loses no unsaved edits (edits persist immediately, per phase 1).

## R5 — Shared view model across three surfaces

The side panel, the Navigator view, and the sheet must read from **one**
`source-set` store instance and one set of pure view functions.

### Acceptance criteria

- [ ] Exactly one `source-set` is created in `activate`; mounting or unmounting
      any one surface neither reloads a source nor drops a watch.
- [ ] A mutation from any surface updates all mounted surfaces without a manual
      refresh.
- [ ] `buildView`, `TaskRow`, the status glyphs, `TaskDetail`, and
      `DetailSections` are reused unchanged except for an added cross-source
      grouping path; no forked copy exists.

## R6 — Preferences for the aggregated surfaces

The Navigator view and the sheet must persist their own group/filter/sort/search
/collapsed-group state, distinct from the side panel's per-workspace keys.

### Acceptance criteria

- [ ] Aggregated-surface prefs use a dedicated key (e.g. `view:cross`) in
      `ctx.storage.global` and never read or write a `view:<workspaceId>` /
      `view:global` key.
- [ ] The Navigator view and the sheet **share** that one aggregated key (they
      are the same list at two sizes), so a filter set in one shows in the other.
- [ ] Prefs are read only after the store reports hydration and re-read when it
      flips (phase-1 rule).
- [ ] The side panel's existing per-workspace prefs behavior is unchanged.

## R7 — Boundary and purity discipline holds

Phase 2's new code obeys every phase-1 boundary rule.

### Acceptance criteria

- [ ] The bare token `providerId` (including `"silo"`) does not appear under
      `src/ui` — the phase-1 grep assertion is extended to the new files and
      still passes.
- [ ] New CSS uses design tokens only (`silo/extension-design-tokens-only`
      passes); no hard-coded colors, fonts, or px sizes.
- [ ] Every tooltip uses the SDK `Tooltip`; the shared `:focus-visible` ring is
      relied on, not re-implemented.
- [ ] `model/` and `lib/` gain no React or `ctx` import; the internal layering
      (`ui → {model, lib, sources}`, `sources → {model, providers}`) is intact.
- [ ] Grouping/filtering/sorting/search over the aggregated `Task[]` remain pure
      functions, unit-testable without rendering; sort stays stable.

## R8 — SDK dependency, if taken (Option A)

If phase 2 extends `ctx.storage` (the recommended path), the change is complete
and documented in the same change in `silo-code/silo`: `workspaceDir` gains an
optional `workspaceId` and an optional `options.create`, and a new
`workspaceDirs(options?)` resolves a path per open workspace.

### Acceptance criteria

- [ ] `workspaceDir()` with no arguments behaves exactly as today — active
      workspace, `NoWorkspaceError` when none, directory created.
- [ ] `workspaceDir(id)` resolves that workspace's dir whether or not it is
      active; `workspaceDir(id, { create: false })` returns the path and creates
      nothing.
- [ ] **`options.create` defaults to `true`** — every existing RFC 0032 caller
      (which writes into the result without calling `createDir`) keeps working
      unchanged; only an explicit `create: false` skips creation.
- [ ] `workspaceDirs()` returns one `{ workspaceId, dir }` per workspace in
      `ctx.workspaces.getState().open`, in a single host round-trip, carrying the
      same `create` default; `workspaceDirs({ create: false })` creates nothing.
- [ ] The `silo-docs-sync` workflow is run: TSDoc with `@public` + `@category` on
      both methods, barrel re-export unchanged (same interface), the
      hand-authored `ctx` storage member page updated, `pnpm docs:api`
      regenerated, the one-line roadmap note added.
- [ ] The extension's `silo.engine` floor and `@silo-code/sdk` devDependency are
      bumped to the versions that carry it, and `engine-compat` gates older apps.
- [ ] If phase 2 instead uses Option B (derive the path in-extension),
      `design.md` records that decision and the coupling is documented as a known
      limitation in the extension README, behind the `resolveWorkspaceTasksDir`
      helper so the swap to Option A is one function body.

## Out of scope

- Beads / dex / any second provider, tracker detection, per-workspace provider
  enablement, "new tasks go to", provider-rendered detail from a real second
  provider, subprocess file-watched refresh — **phase 3**.
- Writes across providers, move/migrate between sources — **phase 4**.
- Decorations of any kind — **phase 5**.
- Tasks from closed workspaces in the aggregated surfaces.
- A kanban board, calendar, or any second persistent store.
- Nesting UI, assignee pickers, or drag-reorder (`parentId` / `assignees` /
  `rank` stay carried-but-unread, per phase 1).
