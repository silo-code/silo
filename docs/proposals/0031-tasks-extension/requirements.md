# Requirements — 0031. Tasks extension (phase 1)

The behavioral specification for **phase 1 only**: the Silo provider, the global
and per-workspace lists, the side panel, and create/edit/complete. Working
artifact — removed when the proposal collapses.

Phase 1 is done when a user installs `silo.tasks`, opens the panel with no
tracker installed and no agent running, and can keep a real list of work.

---

## R1 — Silo-owned storage

Tasks live in newline-delimited JSON files that Silo owns, outside any
repository, in the extension's own storage directory
([RFC 0032](../0032-ctx-extension-storage-directory.md)).

### Acceptance criteria

- [ ] The global list is stored at `<globalDir()>/tasks.jsonl`.
- [ ] The active workspace's list is stored at `<workspaceDir()>/tasks.jsonl`.
- [ ] Each line is one complete JSON object; the file ends with a newline.
- [ ] Every record carries a schema version in a `v` field.
- [ ] Nothing is written into any workspace folder or repository.
- [ ] The extension declares `permissions: []` — no `fs:read`, no `fs:write`,
      no `process`.
- [ ] A file that does not exist yet reads as an empty list, not an error.
- [ ] Writes go through a temporary sibling and a rename, so a **process crash**
      mid-write never leaves a truncated `tasks.jsonl`. (Durability against
      power loss is out of scope — there is no `fsync` in the SDK's file
      surface.)
- [ ] The temporary sibling is named so it does not read as user data
      (`.tasks.jsonl.tmp`), and one left behind by a crash is removed on the
      next successful write rather than accumulating.
- [ ] A line that fails to parse is preserved verbatim and re-emitted on the
      next write; it is never silently dropped, and it does not abort the load
      of the surrounding lines.
- [ ] A malformed file surfaces a non-blocking notice naming the file path, so
      the user can go fix it by hand. Repeated reloads of a still-malformed file
      do not re-notify.

### Concurrent writers

The storage pitch is that an agent or a hand edit can append to `tasks.jsonl`,
so a mutation must not clobber a write that landed while it was in flight.

- [ ] Every mutation re-reads the file's `stat` immediately before the rename;
      if size or mtime changed since the load, the mutation reloads and
      re-applies rather than writing its stale copy.
- [ ] A compare-and-swap retry is bounded; exhausting it surfaces an error and
      leaves the file untouched.
- [ ] Mutations against one source are serialized within the extension, so two
      rapid edits never interleave read-modify-write.
- [ ] The residual race — an external write landing inside the final
      stat→rename gap — is documented in the extension's `README.md` as a known
      limitation.

## R2 — Two sources: global and per-workspace

The extension resolves exactly two Silo sources in phase 1: one always-present
global source, and one for the active workspace when a workspace is open.

### Acceptance criteria

- [ ] The global source exists and is listable with no workspace open.
- [ ] Activating a workspace resolves that workspace's source and the panel
      re-reads it.
- [ ] Closing or deleting a workspace removes its source from the panel without
      touching the file on disk.
- [ ] Each source has a stable `id` derived from its locator, a `providerId` of
      `"silo"`, a `scope` of `"global" | "workspace"`, and a display `name`
      (the workspace's name, or "Personal" for the global source).
- [ ] A source is loaded and watched **once**, owned by the extension rather
      than by the panel, so lazily mounting or unmounting the panel neither
      reloads nor drops the watch. (The multi-consumer payoff lands in phase 2
      with the Navigator view; phase 1 only has to hold the property.)

## R3 — The normalized core task model

The core model holds only what the list sorts, filters, groups, or lays out by.
Everything else reaches the UI as a provider-rendered detail section.

### Acceptance criteria

- [ ] `Task` carries exactly: `id`, `sourceId`, `title`, `lane`, `statusLabel`,
      `priority`, `rank`, `parentId`, `labels`, `assignees`, `updatedAt`.
- [ ] `lane` is the closed union `"todo" | "in_progress" | "blocked" | "done"`.
- [ ] `priority` is the closed union `"high" | "normal" | "low"`.
- [ ] `statusLabel` carries the provider's own word for the status and is what
      the UI displays in detail; `lane` is what the UI groups and sorts by.
- [ ] No description, due date, acceptance criteria, dependency, or comment
      field appears on `Task`.
- [ ] A task's id is unique within its source and stable for the task's
      lifetime.
- [ ] The workspace a task belongs to is **derived** from its source at render
      time; no workspace id is stored in task data.
- [ ] `parentId` and `assignees` are carried and round-tripped but render
      nowhere in phase 1 — nesting and assignment are not phase-1 surfaces.
      They are in core because the RFC's schema is fixed across providers, not
      because phase 1 uses them.
- [ ] `rank` is generated in append order and is lexicographically sortable.
      Phase 1 exposes no manual reordering, so no insert-between generator is
      built.

## R4 — Provider-rendered detail sections

Detail beyond the core model is returned by the provider as plain-data section
descriptors that the core renders generically.

### Acceptance criteria

- [ ] `DetailSection` is a discriminated union covering at least
      `{kind: "text"}`, `{kind: "field", label, value}`, and
      `{kind: "checklist", label, items}`.
- [ ] Descriptors are plain serializable data — no React elements, no functions.
- [ ] The detail view renders any well-formed descriptor without knowing which
      provider produced it.
- [ ] An unknown `kind` is skipped, not thrown on.
- [ ] The Silo provider's description, created date, due date, and acceptance
      criteria all reach the UI through this channel and no other.
- [ ] A descriptor carries an optional `key` and an `editable` hint. A section
      with both is rendered with an editor appropriate to its `kind`, and the
      resulting edit travels back as `TaskPatch.providerFields[key]`.
- [ ] The UI never names a provider-specific field. It knows only the `key`
      strings a provider handed it, in both directions.
- [ ] A provider receiving a `providerFields` key it does not recognize ignores
      it rather than failing the patch.

## R5 — The provider seam

The provider interface is the only path between a source and its data. Provider
identity never leaks into a view.

### Acceptance criteria

- [ ] `TaskProvider` exposes `list` and `detail` as required methods, and
      `createTask`, `updateTask`, `setLane`, `deleteTask`, `watch` as optional
      ones.
- [ ] No `TaskProviderCapabilities` flag object exists; availability of an
      action is `typeof provider.<method> === "function"`.
- [ ] A UI control for an unavailable action is absent or disabled, driven by
      that check.
- [ ] `TaskPatch` names **only** core-model fields, plus a `providerFields` bag
      keyed by detail-section `key`s. No provider's own field names appear on a
      shared type.
- [ ] No identifier under `src/ui` references `providerId` at all — the
      assertion greps for the bare token, not for `providerId ===`, so a
      `switch`, a spacing variant, or an extracted constant cannot slip past it.
- [ ] The Silo provider is registered through the same registry any future
      provider would use.

## R6 — The side panel

One side panel, scoped to the active workspace plus the global list, following
[`docs/side-panel-design.md`](../../side-panel-design.md).

### Acceptance criteria

- [ ] The panel registers via `ctx.registerSidePanel` with `lazyMount: true`.
- [ ] Toolbar: actions row (`Group by ▾`, `Filter ▾`, refresh, new) above an
      inline `SearchInput`, per the side-panel toolbar contract — 26×26 icon
      hits, `gap: 2px`, `ArrowsClockwise` at `size={14}` for refresh.
- [ ] The panel body uses `.silo-scroll`; the toolbar does not scroll away.
- [ ] The panel root sets `font-family` only, never a root `font-size`; kit
      `.silo-list-row` is overridden to `1em`.
- [ ] No hard-coded colors, font families, or font sizes — every one comes from
      a `--silo-color-*`, `--silo-font*`, `--silo-radius-*`, or
      `--silo-button-*` design token. No component token (`--silo-content-*`,
      `--silo-statusbar-*`) and no internal token (`--silo-internal-*`).
- [ ] **Layout** px (the 26×26 hits, `gap: 2px`, the `4px` panel inset, the
      `8px` row pad, `.panel-back`'s `3px 6px`) are the literal values
      `docs/side-panel-design.md` prescribes — those are chrome geometry, not
      theming, and there are no tokens for them. This is the one place literal
      px are correct.
- [ ] The CSS passes the repo's `silo/extension-design-tokens-only` rule.
      `silo-extensions` runs no stylelint of its own, so this is checked by
      copying `tasks/src/**/*.css` into a scratch run of the monorepo's
      `stylelint.config.js` once before phase 1 is called done.
- [ ] No native `title` attribute anywhere — every hover hint is the SDK
      `Tooltip`.
- [ ] No per-element focus style; the global `:focus-visible` ring is used.
- [ ] An empty list renders an `EmptyState` with a create affordance, not a
      bare blank panel.

## R7 — Row vocabulary

### Acceptance criteria

- [ ] A row is one line: status glyph · title · priority indicator.
- [ ] The status glyph is a hollow ring (ready), half-filled (in progress),
      struck ring (blocked), or filled check (done).
- [ ] A done row is struck through and muted.
- [ ] Priority renders as an up arrow (high — the only one that takes color), a
      dash (normal), or a down arrow (low).
- [ ] The task id does **not** appear in the row; it appears in the row's
      tooltip and in the detail page.
- [ ] The provider a task came from is not shown in the row.
- [ ] Whenever more than one source has tasks, a row's source is distinguishable
      by its group header, never by a per-row badge. The panel's **default**
      `Group by` is therefore `Source`, not `None` — with `None` as the default,
      the always-present global list and the workspace list would render as one
      indistinguishable stream on first run.
- [ ] With a single non-empty source, grouping by source collapses to one
      unlabeled group, so the no-workspace case reads as a flat list.

## R8 — List behavior: group, filter, sort, search

### Acceptance criteria

- [ ] `Group by` is a toolbar control offering `None`, `Source` (default in the
      panel — see R7), `Status`, and `Label`.
- [ ] Grouping by `Label` puts a task with several labels in **each** matching
      group, and a task with none in a trailing "No label" group. A task
      appearing more than once under `Label` is correct, not a bug.
- [ ] `Filter` offers lane and label. Lane filtering is multi-select; `done` is
      excluded by default and revealable through the same control.
- [ ] Sort offers `rank` (default), `updated`, `priority`, and `title`. `rank`
      is labelled by what it actually is in phase 1 — creation order — not
      "manual", since nothing reorders.
- [ ] `SearchInput` filters on title and labels, and matches an exact task id.
- [ ] Grouping, filtering, sorting, and search are pure functions over
      `Task[]`, unit-testable without rendering.
- [ ] Group, filter, sort, search, and each group header's **collapsed state**
      (headers follow the shared side-panel section-header pattern — collapsible
      by default) persist and restore across a restart.
      They are stored in `ctx.storage.global` under a workspace-id key — **not**
      `SidePanelProps.storage`, which is the per-workspace bag persisted into
      the workspace record and therefore drops everything when no workspace is
      open (a case R2 requires to work).
- [ ] Persisted preferences are read only after the store reports hydration, and
      re-read when it flips.
- [ ] Sorting is stable — equal keys keep their prior relative order.
- [ ] There is no source-visibility toggle in phase 1. Two sources are separated
      by grouping; hiding one is a phase-2 concern that arrives with detected
      third-party providers.

## R9 — Drill-in detail page

Selecting a row replaces the list page with a detail page, per the side-panel
drill-in contract.

### Acceptance criteria

- [ ] The detail page replaces the list entirely — search, toolbar, and list are
      not visible beneath it.
- [ ] A quiet accent `‹ Back` control (`CaretLeft` + "Back", `.panel-back` CSS
      contract, `--silo-font-size-sm`) leads the page; it is not a filled
      `Button`.
- [ ] Secondary tools are right-aligned on the Back row; the primary action sits
      right-aligned on the title row.
- [ ] `Escape` pops one page when drilled in, and does not close the panel.
- [ ] The detail page shows the task id, `statusLabel`, source name, workspace
      (when the source is workspace-scoped), and every provider detail section.
- [ ] The open task is **not** persisted. A restart returns to the list, never
      into a detail page for a task the user has forgotten they were reading.

## R10 — Create, edit, complete, delete

### Acceptance criteria

- [ ] A task can be created from the panel and from a command.
- [ ] Quick-add is a **title input with a square primary add button to its
      right** (`Plus` glyph only; height tracks the input), docked at the
      **bottom** of the panel below the scrolling list. The button enables only
      when the input has text; `Enter` also submits.
- [ ] **The panel has no destination picker.** It always creates in the active
      workspace's source, falling back to the always-present global ("Personal")
      list when no workspace is open. The Add button names the destination
      ("Add to Repo" / "Add to Personal"). There is no "new tasks go to"
      preference — _revised 2026-08-31 from the original per-workspace
      persisted-default + one-off-override design, which was more machinery than
      a two-source panel needs._
- [ ] `silo.tasks.new` (command) mirrors the panel — active workspace's source,
      global fallback. `silo.tasks.newInGlobal` always targets the global list.
- [ ] Title, description, lane, priority, labels, due date, and acceptance
      criteria are editable from the detail page. **Assignees are not editable
      in phase 1** (see R3) — there is no user directory to populate a picker
      from.
- [ ] Editors for the three fields the design-system kit does not cover:
      **labels** are a kit `Input` holding a comma-separated list, trimmed and
      de-duplicated on commit; **due date** is a native `<input type="date">`
      styled with design tokens; **acceptance criteria** are kit `CheckboxRow`s
      with an `AddRow`. No chips widget, multi-select, or date picker is
      hand-rolled — if one is wanted later it belongs in the kit, not here.
- [ ] Toggling a task complete sets `lane: "done"` and updates `updatedAt`.
- [ ] Deleting a task requires a confirm and removes the record from the file.
- [ ] Every mutation persists immediately and survives an app restart.
- [ ] A mutation that fails to write surfaces an error and leaves the in-memory
      list matching what is actually on disk.

## R11 — Freshness

### Acceptance criteria

- [ ] The list loads on activation, on active-workspace change, and on manual
      refresh.
- [ ] A change to a source's `tasks.jsonl` made outside Silo — by hand or by an
      agent — is reflected in the panel within roughly half a second, with no
      manual refresh.
- [ ] The watch is on the source's **directory**, not on `tasks.jsonl` itself:
      the atomic write replaces the file, so a file-level watch would stop
      firing after the first mutation. Events are filtered to `tasks.jsonl`, and
      the temporary sibling is ignored.
- [ ] External-change reloads are debounced (~150ms) so a burst of writes causes
      one reload.
- [ ] The extension's own writes do not cause a redundant reload loop.
      Suppression is **content-based** — the store compares the reloaded bytes
      against what it last wrote — not a timing window, so the behavior is
      deterministic and its test is not timing-dependent.

## R12 — Commands

No public `TasksApi`; commands are the driving surface for other extensions and
agents.

### Acceptance criteria

- [ ] `silo.tasks.new`, `silo.tasks.newInGlobal`, `silo.tasks.refresh`, and
      `silo.tasks.complete` are registered.
- [ ] No command silently does nothing when invoked from a keybinding with no
      arguments — the hazard `Command.run`'s own docs call out. Specifically: - `silo.tasks.new` / `silo.tasks.newInGlobal` reveal the panel and focus
      quick-add; with a `title` argument they create the task and resolve it,
      without one they resolve `undefined`. The two return shapes are
      documented rather than left to the caller to discover. - `silo.tasks.complete` with a `taskId` resolves the updated task. With no
      argument it completes the task currently drilled into; with no argument
      and no drill-in it reveals the panel and notifies "Select a task to
      complete." - `silo.tasks.refresh` needs no target and always reloads every source.
- [ ] `silo.tasks.complete` given an id that does not exist rejects with a
      message naming the id, and mutates nothing.

## R13 — Packaging

### Acceptance criteria

- [ ] The extension lives in `silo-code/silo-extensions` as `tasks/`, package
      `@silo-extensions/tasks`, manifest id `silo.tasks`.
- [ ] Shipped source imports only `@silo-code/sdk` and `react` — no
      `@tauri-apps/*`, no `node:*`. Test files are exempt: the R5 boundary
      assertion reads source from disk and needs `node:fs`. Nothing under
      `src/` that reaches `dist/` may.
- [ ] `npm run build`, `npx tsc --noEmit`, and `npx vitest run` all pass in the
      extension folder.
- [ ] The two version pins are set correctly and are **different numbers**:
      `silo.engine` is a floor on the **host app** version (`engine-compat.ts`
      checks it against the running Silo), so it names the app release whose
      runtime carries RFC 0032; the `@silo-code/sdk` devDependency names the
      **npm package** release whose types do. Pinning the SDK version into
      `silo.engine` would make the compatibility gate wrong in both directions.
- [ ] It is installable from a built folder; it is not published to the registry
      in phase 1.
- [ ] Behavior is confirmed on Windows, or the gap is recorded. Windows is a
      shipped target, and two phase-1 assumptions are unverified there: the
      host's `resolvePath` treats paths as POSIX by its own admission, so
      `permissions: []` over an own-dir path is untested; and `fs_rename` maps
      to `MoveFileEx`, which overwrites but is not the POSIX atomicity
      guarantee and fails outright on a sharing violation. If either fails, file
      it against RFC 0032 rather than working around it here.

## R14 — Documentation

### Acceptance criteria

- [ ] `docs/domain-language.md` gains a **Tasks** section defining **Task**,
      **Task Source**, **Lane**, and **Ready**, pinning Task to the intent and
      never to an agent run, and noting that Beads' "beads workspace" must not
      reach the UI.
- [ ] That section also distinguishes **Task** from the product's existing
      **Follow-up** (`silo.follow-ups`, [RFC 0021](../0021-follow-ups-extension-sdk.md)).
      "Mark a tab to come back to later" and "a unit of work to do" are adjacent
      enough that users will conflate them; the glossary says which is which, or
      the vocabulary collides in-product. This is a nearer collision than the
      Beads one and needs the same treatment.
- [ ] The extension ships a `README.md` covering storage location, the file
      format, how to point an agent at it, and the concurrent-write limitation
      from R1.
- [ ] `docs/side-panel-design.md`'s working log records any styling rule this
      build forced — at minimum the token-styled native date input, which is the
      first panel control with no kit component behind it.
- [ ] `silo-extensions/README.md` and this repo's `docs/silo-extensions-repo.md`
      inventory both list `tasks/`.
- [ ] A decision is recorded that `silo.tasks` gets **no** row in
      `apps/docs/roadmap.md` — the "Extension-owned features" table is for
      bundled `core.*` / `silo.*` packages, and this ships external.

---

## Out of scope

Deferred to later phases of this RFC, and explicitly not required here:

- Beads, dex, Backlog.md, Linear, or GitHub Issues providers; detection offers;
  per-workspace provider enablement.
- The Navigator view and the Tasks app dock sheet, including batch selection and
  the wider sortable table.
- Cross-provider writes and moving or migrating tasks between sources.
- Decorations — workspace badges, workspace status rows, status-bar items.
- Start Task, agent binding, and the Silo CLI.
- Cross-source dependencies, kanban, calendar, time tracking, team features,
  cloud sync, an MCP server.
- Multiple folders per workspace.
- A published `TasksApi` type surface.
- Assignee editing, subtask nesting, and manual drag-reordering. The `assignees`,
  `parentId`, and `rank` fields exist and round-trip (R3); no phase-1 surface
  reads or writes them.
- Source visibility toggles, and persisting last-known task lists for instant
  paint — both are phase-2 needs that arrive with subprocess providers.
- Multi-writer coordination beyond R1's compare-and-swap: no lock file, no
  journal, no embedded store.
