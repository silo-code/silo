# Tasks — 0031. Tasks extension (phase 1)

The implementation plan for phase 1. Ordered where dependencies matter. Keep the
checkboxes current as work proceeds. Working artifact — removed when the
proposal collapses.

Unless a task says otherwise, work happens in **`../silo-extensions/tasks/`**
(the external repo), with npm — `npm install`, `npm run build`,
`npx tsc --noEmit`, `npx vitest run` — run inside that folder.

## Blocked on — do first

- [ ] RFC 0032 implemented and merged in this repo (`ctx.storage.globalDir()` /
      `workspaceDir()` plus the `ctx.files` own-dir sandbox lift).
- [ ] `@silo-code/sdk` published to npm carrying those methods; note the version.
- [ ] Confirm `permissions: []` really is sufficient — write and read a file
      under `globalDir()` from a scratch extension with no `fs:*` declared.

Local development before the publish can link a built `packages/sdk` instead of
the npm dependency, but the manifest's `silo.engine` and devDependency must be
pinned to the real released version before phase 1 is called done.

## Scaffold

- [ ] Create `tasks/` in `silo-extensions`, modelled on `follow-ups/`:
      `package.json`, `build.mjs`, `tsconfig.json` (extends
      `../tsconfig.base.json`), `vitest.config.ts`.
- [ ] `package.json`: name `@silo-extensions/tasks`, `silo.id` `"silo.tasks"`,
      `silo.publisher` `"Silo"`, `silo.main` `"dist/index.js"`,
      `silo.permissions` `[]`, `silo.engine` pinned to the RFC-0032 release.
- [ ] `build.mjs`: esbuild bundle with `react`, `react/jsx-runtime`, and
      `@silo-code/sdk` marked external; CSS loaded as text and injected at
      activate.
- [ ] `src/index.ts` with a no-op `activate` / `deactivate`; build, typecheck,
      and install the folder into Silo Dev to confirm the round trip works
      before writing any feature code.
- [ ] Add `tasks` to the repo-root `build:all` loop.

## Model and pure logic

Nothing here imports React or `ctx`; all of it is unit-tested before any UI
exists.

- [ ] `model/task.ts` — `TaskLane`, `TaskPriority`, `Task`, `TaskDraft`,
      `TaskPatch`.
- [ ] `model/detail.ts` — the `DetailSection` union (`text`, `field`,
      `checklist`).
- [ ] `model/source.ts` — `TaskSource` and the `TaskProvider` interface with its
      optional methods.
- [ ] `lib/ids.ts` — task id generation and the `rank` midpoint scheme.
- [ ] `lib/view.ts` — `ViewPrefs`, `TaskGroup`, `buildView` (group, filter, sort,
      search) as one pure entry point.

## The Silo provider

- [ ] `providers/silo/record.ts` — `SiloTaskRecord` (`v: 1`), `toTask`,
      `toDetailSections`, `applyPatch`, and unknown-key preservation.
- [ ] `providers/silo/jsonl.ts` — `parseJsonl` / `serializeJsonl` with the
      `unparsed` channel; a higher `v` routes to `unparsed`.
- [ ] `providers/silo/file-store.ts` — load, atomic `.tmp` + `rename` write,
      per-store mutation queue, watch with self-write suppression and debounce.
- [ ] `providers/silo/provider.ts` — `SiloTaskProvider` implementing `list`,
      `detail`, `createTask`, `updateTask`, `setLane`, `deleteTask`, `watch`.
- [ ] `providers/registry.ts` — `providerId → TaskProvider`, with Silo
      registered through the same path a future provider would use.

## Sources and state

- [ ] `sources/source-set.ts` — resolve global + active-workspace sources, own a
      file store per source, expose the `ReactiveService` shape, re-resolve and
      dispose watches on workspace change, dedupe identical locators.
- [ ] `lib/prefs.ts` — `ViewPrefs` and `openTaskId` in `SidePanelProps.storage`,
      `newTasksGoTo` in `ctx.storage.workspace`, with hydration-aware reads and
      the global-source fallback.

## UI

- [ ] `ui/glyphs.tsx` — `StatusGlyph` (ring / half / struck / check) and
      `PriorityMark` (up coloured, dash, down), Phosphor at `size="1em"`.
- [ ] `ui/TaskRow.tsx` — glyph · title · priority, done rows struck and muted,
      id in a `Tooltip` and nowhere else in the row.
- [ ] `ui/TaskList.tsx` — groups and rows over `buildView`, `EmptyState` when
      empty.
- [ ] `ui/TasksToolbar.tsx` — actions row above `SearchInput`; `Group by` /
      `Filter` as `MenuButton`s; 26×26 hits, `gap: 2px`, `ArrowsClockwise` at
      `size={14}`.
- [ ] `ui/QuickAdd.tsx` — create row showing the destination source with a
      one-off override that does not change the persisted default.
- [ ] `ui/DetailSections.tsx` — generic descriptor renderer; unknown `kind`
      returns `null`.
- [ ] `ui/TaskDetail.tsx` — drill-in page: `.panel-back` Back leading, secondary
      tools right-aligned on the Back row, primary action on the title row,
      editable title / description / lane / priority / labels / assignees / due
      date / acceptance criteria.
- [ ] `ui/TasksPanel.tsx` — root; `openTaskId` switches list page ↔ detail page
      (replace, not nest); `Escape` pops one page.
- [ ] `ui/tasks.css` — design tokens only; `.silo-scroll` on the body;
      `font-family` on the root with no root `font-size`;
      `.silo-list-row { font-size: 1em }`; `4px` panel inset, `8px` row content
      pad.

## Registration and commands

- [ ] Register the side panel (`silo.tasks.panel`, `location: "right"`,
      `lazyMount: true`).
- [ ] Register `silo.tasks.new`, `silo.tasks.newInGlobal`, `silo.tasks.refresh`,
      `silo.tasks.complete`, each handling the no-args keybinding path.
- [ ] Wire `ctx.log` for load / write / watch diagnostics; wire `ctx.ui.notify`
      for the unparsed-lines warning and write failures.

## Tests

- [ ] `jsonl.test.ts` — round trip, blank/trailing lines, corrupt line preserved
      at its index, `v: 2` routed to `unparsed`, unknown keys survive, empty
      input.
- [ ] `record.test.ts` — `toTask` field-by-field, `statusLabel` per lane,
      `toDetailSections` covers description/created/due/criteria and only via
      descriptors, no empty sections for absent optionals.
- [ ] `view.test.ts` — every `groupBy` and `sortBy`, sort stability, `showDone`,
      label filter, query over title / labels / exact id, empty input,
      all-filtered-out.
- [ ] `ids.test.ts` — id uniqueness across a large batch; rank midpoints order
      lexicographically between neighbours.
- [ ] `file-store.test.ts` — absent file, `.tmp`-then-`rename` ordering,
      serialized concurrent mutations, self-write suppression, write failure
      reloads from disk.
- [ ] `provider.test.ts` — every implemented method lands in the file; `detail`
      for a missing id rejects.
- [ ] `source-set.test.ts` — global-only with no workspace, workspace resolution,
      re-resolve disposes the old watch, identical locators dedupe, state
      identity changes only on real change.
- [ ] `prefs.test.ts` — defaults, round trip, ignored before `hydrated`,
      `newTasksGoTo` falls back to global.
- [ ] `commands.test.ts` — arg handling, no-args path, unknown task id.
- [ ] `boundaries.test.ts` — grep assertion that `providerId ===` never appears
      under `src/ui`.
- [ ] Shared `makeCtx()` test helper with an in-memory `FileService` fake.

## Documentation

- [ ] `docs/domain-language.md` (this repo) gains a **Tasks** section: **Task**
      (the intent, never an agent run), **Task Source**, **Lane**, **Ready**,
      plus the note that Beads' "beads workspace" must not reach the UI.
- [ ] `tasks/README.md` in `silo-extensions` — what it does, where data lives,
      the `.jsonl` format, and the one line to put in `AGENTS.md` to point an
      agent at it.
- [ ] Update `docs/side-panel-design.md`'s working log with any styling rule this
      build forced.
- [ ] Run through
      [`apps/docs/guide/extension-checklist.md`](../../../apps/docs/guide/extension-checklist.md).

No `silo-docs-sync` run is needed — phase 1 consumes the SDK and does not extend
it.

## Manual verification

- [ ] Fresh install with **no workspace open**: the global list works.
- [ ] Create, edit, complete, and delete a task; restart Silo; state survives.
- [ ] Switch workspaces: the panel swaps to that workspace's list and back.
- [ ] Append a line to `tasks.jsonl` in an external editor: the panel updates
      without a manual refresh.
- [ ] Corrupt a line by hand: surrounding tasks still load, a warning names the
      file, and the corrupt line is still there after the next edit.
- [ ] Light and dark themes, and a non-default `uiFontSize`, both read correctly.
- [ ] Keyboard: `Escape` pops the drill-in, focus ring is the shared one, no
      double outline.

## Verification

- [ ] Every requirement in `requirements.md` is met or explicitly noted as not.
- [ ] In `silo-extensions/tasks/`: `npm run build`, `npx tsc --noEmit`, and
      `npx vitest run` pass.
- [ ] In this repo: `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, and
      `pnpm lint` pass (docs-only changes, but the gate still runs).
- [ ] Durable decisions recorded as ADRs — in particular, decide whether the
      **LCD core + descriptor** model is an ADR in its own right rather than
      only a proposal detail.
- [ ] Proposal collapsed to a single curated `0031-tasks-extension.md`, with the
      remaining phases preserved and `status:` left `accepted` until the whole
      RFC ships.
