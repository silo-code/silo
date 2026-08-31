# Tasks — 0031. Tasks extension (phase 1)

The implementation plan for phase 1. Ordered where dependencies matter. Keep the
checkboxes current as work proceeds. Working artifact — removed when the
proposal collapses.

Unless a task says otherwise, work happens in **`../silo-extensions/tasks/`**
(the external repo), with npm — `npm install`, `npm run build`,
`npx tsc --noEmit`, `npx vitest run` — run inside that folder. The tasks that
touch **this** repo are called out explicitly.

## Status (2026-08-31)

Phase 1 is **built and green** in `../silo-extensions/tasks/`: `npm run build`,
`npx tsc --noEmit`, and `npx vitest run` (70 tests / 10 files) all pass, and the
CSS passes this repo's `silo/extension-design-tokens-only` rule. All this-repo
doc tasks are done. The panel UI is being iterated against
`docs/side-panel-design.md` from live feedback — UI-only tweaks land in the code
and that doc's working log, **not** here.

**Not done — and phase 1 can't be called shipped until they are:**

- No published `@silo-code/sdk` carries RFC 0032's storage methods, and no app
  release carries its runtime. The extension builds against a **linked local
  `packages/sdk`** via a `paths` alias in `tsconfig.json` + `vitest.config.ts`;
  `silo.engine` (`^0.59.0`) and the (absent) SDK devDependency pin are
  **provisional guesses** pending those releases.
- No **Windows** verification (R13 / the blocker below).
- No **runtime pass in the real app** (the Manual verification section) — needs
  the extension installed into a Silo build whose runtime has RFC 0032.
- The proposal is **not collapsed** — phase 1 hasn't shipped, so the planning
  package stays.

**UX revision (2026-08-31):** the quick-add panel has **no destination
picker** — it always creates in the active workspace's source (global list
fallback). The `newTasksGoTo` preference and its storage key were removed;
`requirements.md` R10, `design.md`, and `proposal.md`'s corrections section
are updated to match. `silo.tasks.newInGlobal` still forces the personal list.

**Design deviation, flag for the collapse:** `providers/silo/record.ts`
`toDetailSections` always emits the description / due-date / acceptance-criteria
sections (empty-valued when the record doesn't have them yet) rather than
omitting an absent optional. R10 requires those three to be _editable from the
detail page_, so their editors must always be reachable; "no empty sections for
absent optionals" is applied instead to schema fields the core model doesn't
carry (`assignees`, `parentId`, `closedAt`), which produce nothing. `record.test.ts`
asserts the deviation.

## Blocked on — do first

- [x] RFC 0032 implemented and merged in this repo (`ctx.storage.globalDir()` /
      `workspaceDir()` plus the `ctx.files` own-dir sandbox lift) — shipped in
      `041b475e`, verified end-to-end against
      `examples/extensions/storage-demo-extension`.
- [ ] `@silo-code/sdk` published to npm carrying those methods; note the version.
- [ ] Note the **app** version of the release whose runtime carries RFC 0032 —
      a different number from the SDK version above, and the one `silo.engine`
      pins to.
- [ ] Verify on **Windows**: (a) a read and a write under `globalDir()` with
      `permissions: []`, since `resolve-path.ts` treats paths as POSIX by its
      own admission; (b) `rename` over an existing `tasks.jsonl`, which maps to
      `MoveFileEx` there. File failures against RFC 0032; do not work around
      them here.

Local development before the publish links a built `packages/sdk` instead of
the npm dependency (done — see `tasks/tsconfig.json` + `vitest.config.ts`), but
both pins must name real released versions before phase 1 is called done.

## Decided before implementing

- [x] **No ADR for the LCD core + descriptor channel.** Decided 2026-08-31.
      The reasoning already has a permanent home: this proposal collapses to a
      durable `0031-tasks-extension.md` carrying the LCD rationale and the
      "no capability flags" alternative, so a future proposal for flags is
      already answered. The rule binds nothing outside this extension today —
      the agent catalog is sealed host-side by a deliberately different policy
      (ADR 0028 / 0042), not an ad hoc version of this one — and none of it is
      public SDK surface, so getting it wrong costs a refactor, not a breaking
      release. Revisit when a **second** aggregating surface adopts the same
      seam (Linear / GitHub Issues, or a third party plugging into it): at that
      point it becomes a contract rather than one extension's internal design,
      and there are two implementations to generalize from instead of one to
      guess at.

## Scaffold

- [x] Create `tasks/` in `silo-extensions`, modelled on `follow-ups/`:
      `package.json`, `build.mjs`, `tsconfig.json` (extends
      `../tsconfig.base.json`), `vitest.config.ts`.
- [x] `package.json`: name `@silo-extensions/tasks`, `silo.id` `"silo.tasks"`,
      `silo.publisher` `"Silo"`, `silo.main` `"dist/index.js"`,
      `silo.permissions` `[]`. `silo.engine` (`^0.59.0`) and the SDK
      devDependency are **provisional** — see Status.
- [x] `build.mjs`: esbuild bundle with `react`, `react/jsx-runtime`, and
      `@silo-code/sdk` marked external; CSS loaded as text and injected at
      activate.
- [x] `src/index.ts` with `activate` / `deactivate`; build + typecheck green.
      _(Not yet folder-installed into a Silo Dev build — that needs a runtime
      with RFC 0032.)_
- [x] Add `tasks` to the repo-root `build:all` loop.

## Model and pure logic

Nothing here imports React or `ctx`; all of it is unit-tested before any UI
exists.

- [x] `model/task.ts` — `TaskLane`, `TaskPriority`, `Task`, `TaskDraft`.
- [x] `model/task.ts` — `TaskPatch`: core fields plus a `providerFields` bag
      keyed by detail-section `key`. No provider-specific field names on it.
- [x] `model/detail.ts` — the `DetailSection` union (`text`, `field`,
      `checklist`) with the optional `key` / `editable` members that make the
      channel bidirectional. (`field` also carries an optional `format: "date"`
      hint, so the generic renderer picks a native date input without knowing
      the field's meaning.)
- [x] `model/source.ts` — `TaskSource` and the `TaskProvider` interface with its
      optional methods.
- [x] `lib/ids.ts` — task id generation, and append-order `rank` generation
      (zero-padded counter, lexicographically sortable). No insert-between
      generator — nothing in phase 1 can call one.
- [x] `lib/view.ts` — `ViewPrefs` (with `laneFilter`, not `showDone`),
      `TaskGroup`, and the `buildView` entry point.
- [x] `lib/view.ts` — grouping: `none`, `source` (collapsing to one unnamed
      group when only one source is non-empty), `status`, and `label` (a
      multi-label task lands in every matching group; unlabeled tasks in a
      trailing "No label").
- [x] `lib/view.ts` — filter (lane multi-select defaulting to done-excluded,
      label filter), stable sort, and search over title / labels / exact id.

## The Silo provider

- [x] `providers/silo/jsonl.ts` — `parseJsonl` / `serializeJsonl` with the
      `unparsed` channel; a higher `v` routes to `unparsed`.
- [x] `providers/silo/record.ts` — `SiloTaskRecord` (`v: 1`), `toTask`,
      unknown-key preservation.
- [x] `providers/silo/record.ts` — `toDetailSections` (see the design-deviation
      note in Status) and `applyPatch`, mapping `providerFields` back onto the
      record and ignoring keys it does not recognize.
- [x] `providers/silo/file-store.ts` — load (`stat` + `readText` + parse,
      keeping the stat as the file's version) and the absent-file → empty case.
- [x] `providers/silo/file-store.ts` — write: `.tasks.jsonl.tmp` then `rename`,
      with a stale `.tmp` overwritten rather than accumulating.
- [x] `providers/silo/file-store.ts` — **compare-and-swap**: re-`stat` before
      the rename, reload and re-apply the mutation when the file changed
      underneath, with a bounded retry that rejects and leaves the file
      untouched on exhaustion.
- [x] `providers/silo/file-store.ts` — per-store mutation queue, so two edits
      from inside Silo can't interleave read-modify-write.
- [x] `providers/silo/file-store.ts` — watch the source **directory**, filtered
      to the `tasks.jsonl` basename, debounced ~150ms, with **content-based**
      self-write suppression.
- [x] `providers/silo/provider.ts` — `SiloTaskProvider` implementing `list`,
      `detail`, `createTask`, `updateTask`, `setLane`, `deleteTask`, `watch`
      (plus an optional diagnostics callback for the unparsed-lines notice).
- [x] `providers/registry.ts` — `providerId → TaskProvider`, with Silo
      registered through the same path a future provider would use.

## Sources and state

- [x] `sources/source-set.ts` — resolve global + active-workspace sources
      (caching `globalDir()`, re-resolving `workspaceDir()` per switch, treating
      only `NoWorkspaceError` as "no workspace source"), own a file store per
      source, dedupe identical locators.
- [x] `sources/source-set.ts` — expose the `ReactiveService` shape with a frozen
      state whose identity changes only on real change, and re-resolve /
      dispose watches on workspace change.
- [x] `lib/prefs.ts` — `ViewPrefs` in **`ctx.storage.global`** keyed by
      workspace id, with a `"global"` key for the no-workspace case and
      hydration-aware writes. (`newTasksGoTo` removed — see the UX-revision
      note; the global-source fallback lives in
      `source-set.resolveDestination`.)

## UI

Coarse-grained on purpose — the exact components, glyphs, and CSS are the
implementation's to iterate against `docs/side-panel-design.md` (the living
side-panel/sheet design doc); update **that** doc's working log when a build
forces a rule, not this list.

- [x] **List surface** (`src/ui/`) — the panel body renders `buildView`'s
      groups (collapsible headers matching the shared side-panel section-header
      pattern; collapsed set persisted per workspace) and one-line rows
      (**status glyph · title · priority**; id in the row's hover hint only,
      never the provider), a plain muted line when there's nothing to show, and
      a toolbar (arrange + filter dropdowns labelled by their current value;
      refresh; search field).
- [x] **Quick-add** — a bottom-docked title input + add button that always
      targets the workspace source (global fallback); no destination picker
      (see the UX-revision note above).
- [x] **Drill-in detail page** — replaces the list (`.panel-back` contract),
      edits the core fields directly and every provider `DetailSection` through
      the generic renderer (unknown `kind` → skipped), non-core edits going
      back as `providerFields[key]`. `Escape` pops one page; the open task is
      not persisted. Assignees are not editable in phase 1.
- [x] **Styling** — `src/ui/tasks.css`, design tokens only (passes
      `silo/extension-design-tokens-only` in a scratch run against this repo's
      `stylelint.config.js`); one horizontal inset (`--tasks-pad-x`) across the
      whole panel, per the single-inset rule now in `docs/side-panel-design.md`.

## Registration and commands

- [x] Register the side panel (`silo.tasks.panel`, `location: "right"`,
      `title`, `component`, `lazyMount: true`).
- [x] Register `silo.tasks.new`, `silo.tasks.newInGlobal`, `silo.tasks.refresh`,
      `silo.tasks.complete` (runners extracted to `src/commands.ts` for testing),
      each with the documented with-arg and no-arg behavior — no command
      silently does nothing from a keybinding.
- [x] Wire `ctx.log` for load / write / watch diagnostics; wire `ctx.ui.notify`
      for the unparsed-lines warning (suppressed while the unparsed set is
      unchanged) and for create / save / complete / delete write failures.

## Tests

- [x] `jsonl.test.ts` — round trip, blank/trailing lines, corrupt line preserved
      at its index, `v: 2` routed to `unparsed`, unknown keys survive, empty
      input.
- [x] `record.test.ts` — `toTask` field-by-field, `statusLabel` per lane,
      `toDetailSections` covers description/created/due/criteria and only via
      descriptors, which sections carry a `key`, `applyPatch` maps
      `providerFields` and ignores unknown keys, no section for a
      not-in-core-model schema field (see the deviation note).
- [x] `view.test.ts` — every `groupBy` including multi-label fan-out and
      single-source collapse, every `sortBy`, sort stability, `laneFilter` and
      its done-excluded default, label filter, query over title / labels /
      exact id, empty input, all-filtered-out.
- [x] `ids.test.ts` — id uniqueness across a large batch; append-order ranks
      sort lexicographically in creation order.
- [x] `file-store.test.ts` — absent file, `.tasks.jsonl.tmp`-then-`rename`
      ordering, CAS reload/re-apply preserving an external write, CAS retry
      exhaustion, serialized concurrent mutations, content-based self-write
      suppression, non-`tasks.jsonl` directory events ignored, failed rename
      leaves the file untouched.
- [x] `provider.test.ts` — every implemented method lands in the file,
      `providerFields` reach the record, `detail` for a missing id rejects,
      diagnostics callback reports unparsed lines.
- [x] `source-set.test.ts` — global-only with no workspace, `NoWorkspaceError`
      vs. a real rejection, workspace resolution, re-resolve disposes the old
      watch, identical locators dedupe, state identity changes only on real
      change.
- [x] `prefs.test.ts` — defaults including `groupBy: "source"`, round trip,
      ignored before hydration and re-read when it flips, per-workspace keying,
      empty-vs-missing `laneFilter`.
- [x] `commands.test.ts` also covers `newTask` targeting the workspace source
      when one is open, and `newInGlobal` always hitting the global list.
- [x] `commands.test.ts` — create with and without a title and both return
      shapes; `complete` by id, by drill-in, and with neither; unknown task id.
- [x] `boundaries.test.ts` — grep assertion that the bare token `providerId`
      never appears under `src/ui` (plus: no `"silo"` string literal there).
- [x] Shared `makeCtx()` test helper (`src/test/fakes.ts`) with an in-memory
      `FileService` fake.

## Documentation

- [x] **This repo** — `docs/domain-language.md` gains a **Tasks** section:
      **Task** (the intent, never an agent run), **Task Source**, **Lane**,
      **Ready**, the note that Beads' "beads workspace" must not reach the UI,
      and how a **Task** differs from the existing **Follow-up**.
- [x] `tasks/README.md` in `silo-extensions` — what it does, where data lives,
      the `.jsonl` format, the one line to put in `AGENTS.md` to point an agent
      at it, and the residual concurrent-write window CAS does not close.
- [x] **This repo** — `docs/side-panel-design.md`'s working log records the
      token-styled native date input and the bespoke-row decision.
- [x] **This repo** — `tasks/` added to `docs/silo-extensions-repo.md`'s
      inventory and to `silo-extensions/README.md`.
- [x] **This repo** — decision recorded in `apps/docs/roadmap.md` that
      `silo.tasks` (like `silo.follow-ups` / `silo.agent-monitor`) gets **no**
      row in the Extension-owned features table — that table is bundled-only.
- [x] Ran through
      [`apps/docs/guide/extension-checklist.md`](../../../apps/docs/guide/extension-checklist.md)
      — boundary, permissions (`[]`), styling, commands-with-no-args, lifecycle
      cleanup, packaging externals, and stability all pass. Manual runtime items
      wait on a Silo build with RFC 0032.

No `silo-docs-sync` run is needed — phase 1 consumes the SDK and does not extend
it.

## Manual verification

Blocked on a Silo build whose runtime carries RFC 0032 — not yet run:

- [ ] Fresh install with **no workspace open**: the global list works, and
      group/sort/filter survive a restart.
- [ ] Create, edit, complete, and delete a task; restart Silo; state survives.
- [ ] Switch workspaces: the panel swaps to that workspace's list and back.
- [ ] Append a line to `tasks.jsonl` in an external editor: the panel updates
      without a manual refresh.
- [ ] Append a line externally **while an edit is in flight**: both survive.
- [ ] Corrupt a line by hand: surrounding tasks still load, a warning names the
      file, and the corrupt line is still there after the next edit.
- [ ] Uninstall with data present: the confirm offers "Also delete its data",
      keeps it by default, and logs the retained path.
- [x] Copy `tasks/src/**/*.css` into a scratch run of this repo's
      `stylelint.config.js` and confirm `silo/extension-design-tokens-only`
      passes.
- [ ] Light and dark themes, and a non-default `uiFontSize`, both read correctly.
- [ ] Keyboard: `Escape` pops the drill-in, focus ring is the shared one, no
      double outline.

## Verification

- [ ] Every requirement in `requirements.md` is met or explicitly noted as not
      (most are; the runtime-only and Windows-only criteria are noted above).
- [x] In `silo-extensions/tasks/`: `npm run build`, `npx tsc --noEmit`, and
      `npx vitest run` (69 tests) pass.
- [x] In this repo: `pnpm lint` passes. (`pnpm test` / `tsc` unaffected —
      this repo's changes are docs only.)
- [ ] Confirm the collapsed proposal carries the LCD-core rationale and the
      "no capability flags" alternative — deferred to the collapse.
- [ ] Proposal collapsed to a single curated `0031-tasks-extension.md` — deferred
      until phase 1 ships (needs the SDK/app release and Windows check).
