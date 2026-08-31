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
- [ ] Every record carries a `schemaVersion`.
- [ ] Nothing is written into any workspace folder or repository.
- [ ] The extension declares `permissions: []` — no `fs:read`, no `fs:write`,
      no `process`.
- [ ] A file that does not exist yet reads as an empty list, not an error.
- [ ] Writes are atomic: a crash mid-write never leaves a truncated
      `tasks.jsonl`.
- [ ] A line that fails to parse is preserved verbatim and re-emitted on the
      next write; it is never silently dropped, and it does not abort the load
      of the surrounding lines.
- [ ] A malformed file surfaces a non-blocking notice naming the file path, so
      the user can go fix it by hand.

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
- [ ] Two panels/surfaces reading the same source observe the same in-memory
      state — a source is loaded once, not per consumer.

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
- [ ] `grep -r 'providerId ===' src/ui` returns nothing — including for
      `"silo"`.
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
- [ ] No hard-coded colors, fonts, or px sizes; only `--silo-color-*`,
      `--silo-font*`, `--silo-radius-*`, `--silo-button-*` design tokens.
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
- [ ] When both sources are shown together, a row's source is distinguishable
      by grouping, not by a per-row provider badge.

## R8 — List behavior: group, filter, sort, search

### Acceptance criteria

- [ ] `Group by` is a toolbar control offering `None` (default in the panel),
      `Status`, `Source`, and `Label`.
- [ ] `Filter` offers at minimum lane and label; done tasks are hidden by
      default and revealable.
- [ ] Sort offers manual `rank` (default), `updated`, `priority`, and `title`.
- [ ] `SearchInput` filters on title and labels, and matches an exact task id.
- [ ] Grouping, filtering, sorting, and search are pure functions over
      `Task[]`, unit-testable without rendering.
- [ ] Group, filter, sort, and the source toggle persist per workspace via
      `SidePanelProps.storage` and restore after `hydrated` flips.
- [ ] Sorting is stable — equal keys keep their prior relative order.

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

## R10 — Create, edit, complete, delete

### Acceptance criteria

- [ ] A task can be created from the panel toolbar and from a command.
- [ ] Quick-add shows the destination source and offers a one-off override that
      does not change the persisted default.
- [ ] The default create destination is the active workspace's source when a
      workspace is open, and the global source otherwise; it is persisted per
      workspace as "new tasks go to".
- [ ] When the configured destination is unavailable, creation falls back to the
      global source, which is guaranteed present.
- [ ] Title, description, lane, priority, labels, assignees, due date, and
      acceptance criteria are all editable from the detail page.
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
      agent — is reflected in the panel without a manual refresh.
- [ ] External-change reloads are debounced so a burst of writes causes one
      reload.
- [ ] The extension's own writes do not cause a redundant reload loop.

## R12 — Commands

No public `TasksApi`; commands are the driving surface for other extensions and
agents.

### Acceptance criteria

- [ ] `silo.tasks.new`, `silo.tasks.newInGlobal`, `silo.tasks.refresh`, and
      `silo.tasks.complete` are registered.
- [ ] Each command works when invoked from a keybinding with no arguments, or
      degrades visibly rather than silently doing nothing.
- [ ] `silo.tasks.complete` accepts a task id argument and resolves to the
      updated task.

## R13 — Packaging

### Acceptance criteria

- [ ] The extension lives in `silo-code/silo-extensions` as `tasks/`, package
      `@silo-extensions/tasks`, manifest id `silo.tasks`.
- [ ] It imports only `@silo-code/sdk` and `react` — no `@tauri-apps/*`, no
      `node:*`.
- [ ] `npm run build`, `npx tsc --noEmit`, and `npx vitest run` all pass in the
      extension folder.
- [ ] `silo.engine` names the real minimum SDK version (the one carrying RFC
      0032's storage directories).
- [ ] It is installable from a built folder; it is not published to the registry
      in phase 1.

## R14 — Documentation

### Acceptance criteria

- [ ] `docs/domain-language.md` gains a **Tasks** section defining **Task**,
      **Task Source**, **Lane**, and **Ready**, pinning Task to the intent and
      never to an agent run, and noting that Beads' "beads workspace" must not
      reach the UI.
- [ ] The extension ships a `README.md` covering storage location, the file
      format, and how to point an agent at it.
- [ ] `docs/side-panel-design.md`'s working log records any styling rule this
      build forced.

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
