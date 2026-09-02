# Tasks — 0031 phase 2. Cross-workspace view + Tasks app sheet

Ordered where dependencies matter. Working artifact — removed at collapse.
Phase 1 is the baseline; nothing here re-does phase-1 work.

## 0. Decision gate (before implementation)

- [x] Sign-off on the SDK approach: **Option A** — extend `ctx.storage`
      (`workspaceDir` gains `workspaceId?` + `options.create`, new
      `workspaceDirs()`) in `silo-code/silo`. Confirmed 2026-09-01.
- [ ] Confirm the release path (SDK version, app version, engine floor) — the
      extension work waits on that release, or bridges with Option B behind
      `resolveWorkspaceTasksDir`.

## 1. SDK — extend `ctx.storage` (Option A; repo: `silo-code/silo` — this repo)

- [x] `workspaceDir(workspaceId?: string, options?: { create?: boolean })` —
      `workspaceId` omitted = active (unchanged), `NoWorkspaceError` when none and
      no id; `options.create` **defaults to `true`** (back-compat: existing
      callers write into the result without `createDir`), `false` = resolve only.
- [x] `workspaceDirs(options?: { create?: boolean }): Promise<readonly WorkspaceStorageDir[]>` —
      one entry per workspace in `ctx.workspaces.getState().open`, same `create`
      default. `WorkspaceStorageDir` (`{ workspaceId, dir }`) added to the barrel
      (deviation noted in `design.md`).
- [x] Host resolver (`extension-storage-dirs.ts`: `ensureWorkspaceDir` →
      `resolveWorkspaceDir` with `{ create }`) returns
      `.../extension-storage/<extId>/workspaces/<workspaceId>`; `mkdir` only when
      `create` is true. Wired in `context.ts`.
- [x] `silo-docs-sync`: TSDoc + `@category` on both methods + the new type,
      hand-authored `apps/docs/api/storage/index.md`, `pnpm docs:api`
      (regenerated `api/types/`, new `WorkspaceStorageDir.md`), roadmap note on
      the `ctx.storage` directories row.
- [x] Unit tests: `resolveWorkspaceDir` create-flag (`extension-storage-dirs.test.ts`);
      `workspaceDir("other-id")` path, `workspaceDir(id, { create: false })`
      creates nothing, `workspaceDirs()` one-per-open-workspace (closed excluded),
      `workspaceDirs({ create: false })` creates nothing (`context.test.ts`).
- [ ] Release `@silo-code/sdk` + Silo app; note the versions. _(release chore — not this session)_

## 2. Cross-workspace source resolution (`sources/source-set.ts`)

- [ ] `resolveSources()` builds one Silo source per open workspace (global source
      stays first), matching each `{ workspaceId, dir }` to its `Workspace` for
      the name.
- [ ] Source of the dirs: `ctx.storage.workspaceDirs({ create: false })`
      (Option A) or a loop over `resolveWorkspaceTasksDir(w)` (Option B bridge);
      keep the phase-1 locator dedupe.
- [ ] Move error state from the single `SourceSetState.error` to per-source
      (`errorsBySource` map or `TaskSource.error?`); one workspace's failure
      yields an errored, empty source and does not abort the rest.
- [ ] Confirm `syncWatches` handles the larger set unchanged (add/remove diff).
- [ ] Re-resolve on any `ctx.workspaces` open/close, not only active-id change.
- [ ] Add a filtered selector the side panel uses (global + active) so its
      behavior is unchanged.

## 3. Shared UI shell (`ui/`)

- [ ] Extract the drill-in stack from `TasksPanel` into `useDrillStack` (tested
      reducer: push / pop / Escape-pops-one / never-closes); `TasksPanel` adopts it.
- [ ] `AggregatedList.tsx` — props `{ ctx, sourceSet, prefsStore, bridge, paused?, density? }`;
      reads the full source set, flattens, `buildView`, renders group headers +
      `TaskList` / `TaskRow`, inline `SearchInput`, owns the drill stack.
- [ ] Reuse `TaskDetail` / `DetailSections` / glyphs verbatim for drill-in.

## 4. Navigator view (`ui/CrossTasksView.tsx`, `index.ts`)

- [ ] `ctx.registerNavigatorView({ id: "silo.tasks.cross", title: "Tasks", icon, order: 20, component })`.
- [ ] Body is `<AggregatedList paused={!active}>`.
- [ ] Register `"navigator"`-surface toolbar items (`Group by` / `Filter` /
      `Sort` / `New task`) scoped with `when: ctx.activeView === "silo.tasks.cross"`.
- [ ] `New task` reveals the side panel and focuses quick-add (phase-1 command
      behavior — no destination picker; that's phase 3).
- [ ] Renders with no workspace open (global source only).

## 5. Tasks app dock sheet (`ui/TasksAppSheet.tsx`, `index.ts`)

- [ ] `silo.tasks.open` command → `ctx.layout.openPanelSheet(PANEL_ID, render, { title: "Tasks", width: 720, mode: "push" })`.
- [ ] `sheetOpen` single-instance guard; a second call re-reveals via
      `revealSidePanel(PANEL_ID)`; reset in `.finally`.
- [ ] Body is `<AggregatedList density="sheet">`; host header kept (`bare: false`).
- [ ] Escape pops a drill-in page, never closes the sheet.
- [ ] Renders with no workspace open.

## 6. Preferences (`lib/prefs.ts`)

- [ ] `viewKey("cross")` → `"view:cross"`; Navigator + sheet share it.
- [ ] A second `PrefsStore` bound to the `"cross"` key (simplest), or
      `setSurface` on the existing store — pick one, keep it pure.
- [ ] Reads gated on hydration; re-read on flip (phase-1 rule).
- [ ] Verify the side panel's `view:<id>` / `view:global` behavior is untouched.

## 7. Docs (same change)

- [ ] `docs/domain-language.md` — add **Tasks app** (the aggregated
      cross-workspace surface; Navigator view + sheet are two presentations).
- [ ] `docs/side-panel-design.md` / `docs/modal-design.md` working logs — note
      the sheet surface and any new control.
- [ ] Extension `README.md` — document the cross-workspace view and the Tasks
      app; if Option B was used, the storage-path coupling as a known limitation.
- [ ] `apps/docs/roadmap.md` — the `ctx.storage` roadmap note (Option A only).
- [ ] Re-evaluate whether the LCD-core + descriptor seam now warrants an ADR
      (the durable proposal says to revisit when a second aggregating surface
      adopts it). Record the outcome in the collapse.

## 8. Tests

- [ ] `view.test.ts` — cross-source grouping cases (per `design.md`).
- [ ] `source-set.test.ts` — N+1 resolution, empty-file source, worktree dedupe,
      open/close add/remove without leak, one-workspace failure isolated,
      deactivate disposes every watch.
- [ ] `prefs.test.ts` — `view:cross` round-trip and isolation from workspace keys.
- [ ] `commands.test.ts` — `silo.tasks.open` open-once / re-reveal / no-workspace.
- [ ] `boundaries.test.ts` — extended to the new `ui/` files and `model`/`lib`
      import purity.
- [ ] `useDrillStack` reducer tests.

## 9. Verification

- [ ] Every requirement in `requirements.md` (R1–R8) met or explicitly noted as not.
- [ ] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, `pnpm lint` pass
      (extension: `npm` build per `docs/silo-extensions-repo.md`; `node build.mjs`).
- [ ] Runtime check via `verifier-gui` — the scenario in `design.md` → Testing.
- [ ] Durable decisions recorded (ADR only if the seam re-evaluation says so).
- [ ] Collapse to a single curated `docs/proposals/0031-tasks-extension.md`,
      mark phase 2 implemented in the phase table, keep `status: accepted`
      (phases 3–5 remain), delete `requirements.md` / `design.md` / `tasks.md`,
      repoint the index row to `./0031-tasks-extension.md`.
