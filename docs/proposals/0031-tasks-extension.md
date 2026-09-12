---
status: accepted # phases 1–2 implemented; phases 3–5 remain
created: 2026-08-30
---

# 0031. Tasks extension — Silo-managed tasks, with third-party trackers as sources

## Summary

A `silo.tasks` extension that gives Silo **task management out of the box** —
tasks stored and owned by Silo, at a global level and per workspace, with no
external tracker required and nothing written into a repo. Third-party trackers
(Beads, dex, later Backlog.md / Linear / GitHub Issues) are supported
**additively** as extra sources in a workspace, not as a prerequisite.

The extension lives in the external `silo-code/silo-extensions` repo as `tasks/`
and consumes Silo only through the published `@silo-code/sdk`.

**Phases 1–2 have shipped.** Phase 1 is the Silo provider, the global and
per-workspace lists, and the side panel with drill-in detail and
create/edit/complete/delete. Phase 2 is the two **aggregating surfaces** — the
Navigator cross-workspace view and the Tasks app dock sheet — plus the
`ctx.storage` extension they needed. Phases 3–5 (below) are still planned.

## Motivation

Silo's audience keeps many projects alive at once and drives them with coding
agents. The work itself — what to do next, what's blocked, what an agent should
pick up — had no home in the app. It lived in a terminal, a scratch file, or
someone else's tracker in a browser tab.

A survey of twelve comparable tools (Conductor, Superset, Orca, Vibe Kanban,
Emdash, Pane, JetBrains, GitLens, VS Code's GitHub Issues, Kiro, Backlog.md,
Beads) found that **not one ships a task manager that works with no tracker
installed and no agent running**:

- The parallel-worktree orchestrators use "task" as a synonym for "agent
  session" — their list has no rows before an agent exists and none after the
  branch merges.
- The editor integrations have real task semantics but are panels over someone
  else's tracker.
- The only tools that store a task of their own are CLIs with no GUI, or in-repo
  formats that write files into a repo you may not own.

That last constraint matters for Silo specifically. Both credible in-repo
trackers modify the repository to get started: `bd init` writes an `AGENTS.md`,
installs git hooks, **and makes a git commit**; `backlog init` writes an
`AGENTS.md` and a config file. Neither is appropriate in a repo you're only
reading, and neither should ever be triggered on a user's behalf. So the opening
is a task manager that is useful the moment it's installed, stores nothing in the
repo unless asked, and treats external trackers as an upgrade rather than an
entry requirement.

The complementary, Silo-specific opportunity is **JetBrains' "Open Task"** —
restoring tabs, bookmarks, and breakpoints for a task is the most-loved pattern
in the field. Silo's workspaces never tear down, so binding a task to one is
nearly free. This proposal does not build that (see Non-goals), but it is why
the architecture keeps a task's workspace association **derivable, never
stored**.

**Phase 2 specifically:** phase 1 gave each workspace a task list, but every
list is walled inside its own workspace — to see what is outstanding across
projects you switch workspaces one at a time. The cross-workspace view answers
"what is on my plate everywhere" in one place, and the app sheet gives that same
answer the room a ~250px side panel cannot. Both are the reason the phase-1
store was built as a shared, always-on resource rather than something the panel
owns.

## Architecture

### The Task Source

A **Task Source** is one resolved store of tasks; everything else hangs off it. A
source is identified by its **locator** and is either:

- **Silo-managed** — a file Silo owns, outside any repo. One always-present
  **global** source (deliberately unnamed) and optionally one per workspace.
- **Repo-derived** — a third-party tracker detected in a workspace folder (phase
  3+).

The provider (Silo, Beads, dex) is an implementation detail _of_ a source. Two
workspaces that are worktrees of the same repository resolve to the **same**
source — the locator is a dedupe key. Providers are **additive per workspace**: a
workspace may have any number of sources enabled at once (phase 3+).

### The normalized model: LCD core, provider-rendered detail

The core `Task` schema holds **only what the list sorts, filters, groups, or
lays out by**, plus one display-only preview string:

```
id · sourceId · title · lane · statusLabel · priority · rank ·
parentId · labels · assignees · updatedAt · descriptionPreview?
```

- `lane` is the closed set `todo | in_progress | blocked | done` that every
  provider maps into; `statusLabel` carries the provider's own word so nothing
  is lost in display.
- `descriptionPreview` is a short, already-truncated, plain-text string a
  provider's `toTask()` maps once (like `statusLabel`). It is explicitly a
  preview — the full, round-trippable description lives only on a provider
  `DetailSection`, never on `Task`.
- Description, due dates, dependencies, acceptance criteria, and comments are
  **not** in core. They reach the UI as **typed detail-section descriptors** —
  `{kind: "text"}`, `{kind: "field", label, value}`, `{kind: "checklist", …}` —
  plain serializable data the core renders generically, knowing nothing about
  which provider produced them.
- Descriptors carry an optional `key` + `editable`; an edit to a keyed section
  travels back as `TaskPatch.providerFields[key]`, so provider-specific field
  names never appear on the shared patch type — in either direction.

**No capability flags.** Data capability is expressible in the data (dex returns
`labels: []`); action capability is an **optional method** on the provider
interface (`createTask?`, `updateTask?`, `setLane?`, `deleteTask?`, `watch?`).
`if (provider.createTask)` is type-safe and cannot drift out of sync with
reality.

**The health check for the whole abstraction:** the bare token `providerId` —
including the string `"silo"` — must never appear under `src/ui`. Enforced by a
grep-based `boundaries.test.ts`.

### One `source-set`, three surfaces

The load-bearing idea of phase 2: **one reactive store, three views**. The
`source-set` store is created once in `activate`; the side panel, the Navigator
view, and the Tasks app sheet all read from it and one set of pure view
functions (`lib/view.ts`). Mounting or unmounting any surface never reloads a
source or drops a watch; a mutation from any surface re-renders all mounted
surfaces. There is no forked copy of the list, the row, or the detail page.

- The **`source-set`** resolves the global source plus one per open workspace
  (`ctx.storage.workspaceDirs`, N+1 total), each with its own directory watch.
  Re-resolution is guarded by a signature over the open workspaces' ids and
  names, so a plain active-workspace switch doesn't reload every list. A
  per-source failure surfaces as one muted line above the list naming the
  affected workspaces (`errorsBySource` map) and never aborts the others.
- The **side panel** takes a filtered slice — global + active workspace only —
  so its behavior is unchanged from phase 1.
- The **Navigator view** (`CrossTasksView`) and the **sheet** (`TasksAppSheet`)
  read the whole set.
- **`TasksBody`** is the one shell all three mount; surfaces differ only in
  which sources they are handed and which chrome they own (inline controls, a
  quick-add dock, a composer, the row variant).

### Phase 1 implementation

Live in `silo-extensions/tasks/`.

- **Storage.** NDJSON, one `SiloTaskRecord` (`v: 1`) per line, trailing newline,
  at `<globalDir()>/tasks.jsonl` and `<workspaceDir()>/tasks.jsonl` — RFC 0032's
  per-extension directories, tier-1 user data (ADR 0022). `permissions: []` —
  RFC 0032's sandbox lift reaches an extension's own directory through
  `ctx.files`.
- **Write strategy.** Whole-file rewrite to a dotted sibling
  `.tasks.jsonl.tmp` then `rename` — a crash mid-write never truncates the real
  file.
- **Compare-and-swap.** Every mutation re-`stat`s immediately before the rename
  and, if size or mtime changed since the load, reloads and re-applies rather
  than clobbering. Bounded retry; exhaustion rejects and leaves the file
  untouched. Mutations are serialized per store. The residual stat→rename race
  is **documented in the extension README as a known limitation**, not designed
  away.
- **Unparsed-line preservation.** A line that fails to parse is kept verbatim at
  its index and re-emitted on the next write — never silently dropped, and it
  does not abort the load of surrounding lines. A malformed file surfaces one
  non-blocking notice naming the path.
- **Freshness.** `ctx.files.watch` on the source's **directory** (the atomic
  rename replaces the inode), filtered to the `tasks.jsonl` basename, debounced
  ~150ms. Self-write suppression is **content-based** (compare reloaded bytes to
  the last write), not a timing window.
- **Side panel.** `ctx.registerSidePanel` with `lazyMount: true`, following
  `docs/side-panel-design.md`: actions row above an inline `SearchInput`;
  `.silo-scroll` body; design tokens only; SDK `Tooltip` everywhere; the shared
  `:focus-visible` ring.
- **Row vocabulary.** One line: status glyph (hollow ring / half-filled / struck
  ring / filled check) · title · priority mark (up = high, the only one
  coloured; dash = normal; down = low). **No task id in the row.**
- **Grouping** is a toolbar control (ADR 0038): `None`, `List` (the panel
  default — the persisted value is still `"source"`), `Status`, `Label`. A
  single non-empty source collapses to one unlabelled group, so the no-workspace
  case still reads flat.
- **Drill-in detail** replaces the list page entirely (`.panel-back` contract,
  `Escape` pops one page, never closes the panel). Edits title, lane, priority,
  labels, description, due date, and acceptance criteria. Labels = a kit `Input`
  with a comma-separated list; due date = a token-styled native
  `<input type="date">`; acceptance criteria = kit `CheckboxRow` + `AddRow`. The
  open task is **not** persisted.
- **Quick-add** is a bottom-docked title input + square `Plus` button, no
  destination picker: it always creates in the active workspace's source,
  falling back to the global list when no workspace is open.
- **Preferences** (group, filter, sort, search, collapsed group headers) persist
  in `ctx.storage.global` keyed by workspace id, with a `"global"` key for the
  no-workspace case — **not** `SidePanelProps.storage` / `ctx.storage.workspace`,
  which would drop everything when no workspace is open. Read only after the
  store reports hydration.

### Phase 2 implementation

Added to `silo-extensions/tasks/`; the `ctx.storage` extension landed in
`silo-code/silo`.

- **`ctx.storage` extension (in `silo-code/silo`).** `workspaceDir` gained an
  optional `workspaceId` (resolve any workspace's dir, not just the active one)
  and an optional `options.create` (**default `true`** — every existing RFC 0032
  writer relies on `workspaceDir()` having made the directory, and `writeText`
  does not create parents); a new `workspaceDirs(options?)` resolves a path per
  open workspace in one host round-trip. One small barrel type
  `WorkspaceStorageDir` (`{ workspaceId, dir }`). Ran the `silo-docs-sync`
  workflow (TSDoc + `@category`, hand-authored `ctx` storage member page,
  `pnpm docs:api`, one-line roadmap note under the `ctx.storage` row). **No new
  roadmap primitive, no ADR** — it moves no architectural boundary. The
  extension's `silo.engine` floor and `@silo-code/sdk` devDependency are bumped
  to the versions that carry it.
- **Navigator cross-workspace view.** `ctx.registerNavigatorView` titled
  "Tasks", `ListChecks` icon, `order: 20`. A **list only** — it never pages
  into a task's detail; picking a row hands the task to the Tasks app sheet
  (which has the width to read it and leaves the list standing beside it), so
  nothing in the view consumes `Escape`. Its controls are one `"navigator"`-
  surface toolbar item, `silo.tasks.nav.view` (`FunnelSimple`, "View options"),
  whose menu is `viewMenu` (`lib/menus.ts`) — cascading `MenuItem.submenu`
  parents: **Group by**, **Sort by** (with direction toggle), **Filter by
  status**, **Filter by label** (omitted when no label exists), and **List**
  (`sourcesFilterMenu`, multi-select checkable). Plus `silo.tasks.nav.new` and
  `silo.tasks.nav.openSheet` ("Manage tasks"). No inline search box — the
  "Manage tasks" button opens the sheet, which has a real one.
- **Tasks app dock sheet.** `silo.tasks.open` opens a dock-anchored,
  **non-modal** sheet (`ctx.layout.openPanelSheet`, `mode: "overlay"` — it
  covers the center dock rather than narrowing it, `width: 720`), anchored to
  the column the Navigator view is docked in (`navPanelId`, captured as that
  view renders), falling back to the tasks side panel. A single-instance guard
  in `commands.ts` re-reveals / re-points an open sheet rather than stacking a
  second. The sheet is the **only** aggregated surface with a detail page.
  Title "Manage Tasks"; the sheet header and body padding are trimmed (scoped
  `.tasks-sheet` overrides of the host `Sheet.css` defaults) so the title lines
  up with the Navigator label beside it and the controls sit close under it.
- **The sheet's list page** is a multiline row per task (`TaskRows`) — status
  glyph, title, priority on line one; a two-line-clamped `descriptionPreview`;
  a meta line with label chips, the list name, the id, and a relative "updated"
  time. (It went table → resizable TanStack `<table>` → back to multiline rows
  during planning; the fixed-width grid could never show every field without
  truncating one. TanStack and its vendor shim were removed, not left unused.)
  Grouping is forced off for this variant regardless of the shared `groupBy`.
- **The composer** is the sheet's own create row (not the panel's `QuickAdd`):
  a collapsible "New task" header, a title field, and one wrapping row with a
  priority control, a **list picker** (the panel's `QuickAdd` has none — the
  sheet has no single "active" workspace), and a labels field. Submitting clears
  only the title and refocuses it; priority, labels, and the picked list persist
  for the next task.
- **Batch editing** (sheet list page only): an always-visible per-row checkbox
  and an idle "N tasks" + select-all strip that occupies the same slot the
  action bar takes once something is picked. The action bar sets status /
  priority / adds a label / **deletes** the selection, each fanning out over the
  existing single-task provider methods (no new `TaskProvider` method). The bar
  carries no background fill and a picked row gets no highlight — the checked
  box is the only selection feedback.
- **List row hover card.** Hovering a `TaskRow` title (side panel + Navigator)
  opens a `TaskHoverCard` with the rest of the core `Task` (status label,
  priority, list name, label chips, `descriptionPreview`, id, updated time). It
  rides `HoverCard` (`ui/HoverCard.tsx`), a local `position: fixed` preview-card
  primitive — the SDK `Tooltip` is string-only and the host shares no
  `react-dom` with extensions, so `createPortal` is unavailable. The SDK
  `Tooltip` stays the rule for plain text hints.
- **Separate prefs.** The Navigator view persists on `view:cross`, the sheet on
  `view:sheet`, both in `ctx.storage.global` — kept apart because the narrow
  rail and the full-width sheet are arranged differently. The side panel's
  per-workspace keys are untouched.
- **`use-drill-in.ts`** is a pure drill reducer plus the `Escape`-owning hook,
  seeded by `initialTask`; detail replaces the list rather than nesting, so
  there is no stack.

### Commands

The driving surface, in place of a published `TasksApi`. Every command runs
usefully with **no arguments**, so all are safe to bind to a shortcut:

- `silo.tasks.newInWorkspace` — title → create in the active workspace's list
  (global personal list when none is open); no title → reveal the panel + focus
  quick-add.
- `silo.tasks.newInApp` — open the Tasks app on its composer (expanded, title
  focused). The composer's list picker is how you create into a chosen list.
- `silo.tasks.open` — open (or re-reveal) the Tasks app, caret in its search
  box.
- `silo.tasks.refresh` — reload every resolved source.

There is **no "complete task" command** — it could only act on a target passed
as an argument, which a keybinding never carries. Completing is done from the
task's detail page or the sheet's batch bar. A task-addressed `complete` returns
once there is a selection model a keybinding can read.

## Phases

| Phase     | Scope                                                                                                                                                                                                                              | Status                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **1**     | Silo provider only — global + per-workspace lists, side panel, list with filter/sort/search, drill-in detail, create/edit/complete/delete. No provider UI, because there is nothing to choose.                                     | **Implemented** — `silo-extensions` `tasks/`                               |
| **2**     | The **Navigator cross-workspace view** and the **Tasks app dock sheet** — two aggregating surfaces over the phase-1 Silo provider seam — plus the `ctx.storage` extension (`workspaceDir` params + `workspaceDirs()`) they needed. | **Implemented** — `silo-extensions` `tasks/`, SDK/host in `silo-code/silo` |
| **3**     | Beads **and** dex together. Detection offers, per-workspace enablement, "new tasks go to", provider-rendered detail sections from a real second/third provider, file-watched refresh for subprocess providers.                     | Planned                                                                    |
| **4**     | Writes across providers; move/migrate between sources with lossy-field warnings and dependency-id remapping.                                                                                                                       | Planned                                                                    |
| **5**     | Decorations — workspace badges, status rows, status bar — all **default off**.                                                                                                                                                     | Planned                                                                    |
| **Later** | Backlog.md, Linear, GitHub Issues; Silo CLI for agent access; Start Task.                                                                                                                                                          | Planned                                                                    |

**Phase 2 was split out of the original phase 2** (2026-09-01) — that bundled the
aggregation surfaces with the Beads/dex provider work. They separate cleanly:
the Navigator view and the Tasks app sheet are pure UI over the seam phase 1
already shipped and need no second provider to build or prove. Every later phase
shifted down one number; nothing was dropped.

Phase 3 pairs Beads and dex deliberately: they are maximally different
(subprocess + Dolt + rich dependency graph vs. a plain file with no labels and no
assignees), and with Silo as a superset that gives one provider _richer_ than the
core schema and one _poorer_ — the actual test of whether the LCD line is drawn
correctly.

Phases 1–2 built the **full provider seam** (`TaskSource`, the normalized core
model, the optional-method `TaskProvider` interface, detail-section descriptors)
with Silo as its only implementation — because the LCD line is the whole
architectural claim of this RFC, and drawing it against one provider then
reshaping it under two is a worse test than designing it once.

## Requirements that still matter

- Tasks live in Silo-owned NDJSON outside any repo; nothing is written into a
  workspace folder. `permissions: []`.
- A missing file reads as an empty list. A crash mid-write never leaves a
  truncated file. An unparsable line is preserved, never dropped.
- Mutations are compare-and-swap against concurrent external writers, serialized
  within the extension; the residual stat→rename race is documented, not fixed.
- The global source always exists and is listable with no workspace open;
  closing a workspace removes its source from every surface without touching the
  file.
- A task's id is unique within its source and stable for its lifetime. The
  workspace a task belongs to is **derived** from its source at render time,
  never stored in task data.
- `parentId`, `assignees`, and `rank` are carried and round-tripped but no
  surface reads or writes them (no nesting UI, no assignee picker, no
  drag-reorder). They are in core because the schema is fixed across providers.
- Everything beyond the core schema reaches the UI only through detail-section
  descriptors; an unknown `kind` is skipped, not thrown on. No view references
  `providerId`.
- `TaskProvider` action methods are optional; a UI control for an unavailable
  action is absent or disabled based on `typeof provider.<method>`.
- An external change to `tasks.jsonl` is reflected in every surface showing that
  source within roughly half a second with no manual refresh; the extension's
  own writes do not cause a reload loop.
- Grouping, filtering, sorting, and search are pure functions over `Task[]`,
  unit-testable without rendering; sort is stable.
- **Phase 2:** one `source-set` instance; the side panel, the Navigator view,
  and the sheet share it and one set of view functions — no forked list, row,
  or detail page. The Navigator view is a list only and never pages into
  detail. The sheet is non-modal and the only aggregated surface with a detail
  page. The Navigator view and the sheet keep separate prefs keys from the side
  panel and from each other. Tasks from closed workspaces never appear.
- **Phase 2 SDK:** `workspaceDir()` with no args is unchanged; `workspaceDir(id)`
  resolves any workspace, active or not; `options.create` defaults to `true`;
  `workspaceDirs()` returns one `{ workspaceId, dir }` per open workspace in one
  round-trip.

## Key decisions

- **`priority` is a core-schema field**, not detail — the list sorts by it and
  every row renders it.
- **Storage follows RFC 0032's directory shape** — `globalDir()/tasks.jsonl` and
  `workspaceDir()/tasks.jsonl`, not a shared directory with `ws-<id>` prefixes.
- **No "new tasks go to" setting on the panel.** The active-workspace-with-
  global-fallback rule plus the Tasks app composer's list picker (via
  `silo.tasks.newInApp`) cover it. A real panel destination choice returns in
  phase 3, when detected third-party providers make "which of several sources" a
  genuine question.
- **The Silo provider watches its own file** — for a plain file the extension
  owns, it's a few lines and the storage pitch (an agent appends to the
  `.jsonl`) makes it mandatory.
- **A patch's non-core fields travel through the descriptor channel** (`key` →
  `providerFields[key]`), not as provider-named keys on the shared `TaskPatch`.
- **`toDetailSections` always emits the description / due-date / acceptance-
  criteria sections** (empty-valued when absent) so their editors are always
  reachable. "No empty sections for absent optionals" applies instead to schema
  fields the core model doesn't carry (`assignees`, `parentId`, `closedAt`).
- **The global source is unnamed** (`TaskSource.name === ""`) rather than
  "Personal" / "My Tasks" — both proper nouns read oddly as one option in a
  dropdown of workspace names. `NO_LIST_LABEL` ("No list") is UI copy for the
  _absence_ of a value in a picker; `TaskDetail` and group headers render
  nothing at all for it.
- **`GROUP_LABELS.source` displays as "List"**, matching `TaskDetail`'s identity
  footer; the persisted `GroupBy` value stays `"source"` (no migration).
- **The sheet is a dock sheet, not a dock panel kind** — anchored, non-modal,
  dismissible, not a persistent tab the user manages.
- **The sheet's list page is not byte-identical to the panel's** (a narrow
  revision of phase-2's original "no density flag" call): `TaskRow` / `TaskList`
  stay reused unchanged by the panel and Navigator view, while the sheet gets
  its own multiline `TaskRows`, composer, and batch bar as new components.
- **Option A for cross-workspace storage** — extend `ctx.storage` in
  `silo-code/silo` rather than derive the path in-extension (Option B, a
  rejected fallback: the SDK documents the path shape as non-contractual).
  AGENTS.md — "if an extension needs a capability the SDK lacks, add it to
  `ctx`".
- **No ADR for the LCD core + descriptor channel.** It binds nothing outside
  this extension, is not public SDK surface, and its rationale lives here. The
  phase-2 re-evaluation stands: the second aggregating surface is the same
  extension, not an independent consumer, and phase 2 added no new provider — the
  seam has still only ever been exercised by one provider. Revisit at phase 3,
  when Beads/dex make it a real contract with two implementations to generalize
  from.

## Implementation

- **Repo / package:** `silo-code/silo-extensions`, `tasks/`, package
  `@silo-extensions/tasks`, manifest id `silo.tasks`, `publisher` `"Silo"`,
  `permissions: []`. Phase 1 in `silo-extensions` #100; phase 2 UI work in the
  same repo. The `ctx.storage` extension is in `silo-code/silo` — SDK types in
  `packages/sdk/src/extension-storage.ts` (+ barrel + `WorkspaceStorageDir`),
  host wiring in `context.ts` + `extension-storage-dirs.ts`, docs in
  `apps/docs/api/storage/`.
- **Layout:** `model/` (pure types), `lib/` (pure `ids` / `view` / `prefs` /
  `menus` / `time` / `text` / `labels` / `focus`), `providers/silo/`
  (`jsonl`, `record`, `file-store`, `provider`) + `registry`,
  `sources/source-set` (the one reactive store), `ui/` (`TasksBody` shell,
  `TasksPanel` / `CrossTasksView` / `TasksAppSheet` wrappers, `TasksToolbar`,
  `TaskList` / `TaskRow` / `TaskRows`, `TaskDetail` / `DetailSections`,
  `Composer`, `BatchBar`, `QuickAdd`, `HoverCard` / `TaskHoverCard`,
  `use-drill-in` / `use-batch-selection`, `panel-bridge`, `glyphs`, CSS).
  Internal layering: `ui → {model, lib, sources}`, `sources → {model,
providers}`, `providers → model`; nothing under `model/` or `lib/` imports
  React or `ctx`.
- **Tests:** co-located Vitest, pure-logic style — `jsonl`, `record`, `view`,
  `ids`, `file-store`, `provider`, `source-set`, `prefs`, `commands`, `menus`,
  `time`, `text`, `labels`, `use-drill-in`, `use-batch-selection`, and a
  grep-based `boundaries` assertion. `FileService` is faked in-memory at the
  `ctx.files` seam.
- **Dependencies / sequencing:** phase 1 floored on `@silo-code/sdk` 0.42.0 /
  Silo app 0.59.0 (RFC 0032). Phase 2's `ctx.storage` extension lifts both
  floors — the extension's `silo.engine` and `@silo-code/sdk` devDependency are
  bumped to the release carrying `workspaceDirs()`. The extension is not
  published to the registry; it is installable from a built folder, gated by
  `silo.engine` for older apps.
- **Docs:** `docs/domain-language.md` has a **Tasks** section (Task, Task
  Source, Lane, Ready; Task pinned to intent, never an agent run; Task vs.
  Follow-up) plus **Tasks app** (the aggregated cross-workspace surface).
  `docs/side-panel-design.md`'s working log records the token-styled native date
  input. `docs/silo-extensions-repo.md` and `silo-extensions/README.md` list
  `tasks/`. `silo.tasks` gets **no row** in `apps/docs/roadmap.md` (that table
  is for bundled `core.*` / `silo.*` packages); the `ctx.storage` roadmap row
  gained a one-line note.

## Non-goals

- **Start Task / agent binding / the Silo CLI** — deferred until Agent Profiles
  make the flow obvious.
- **A published `TasksApi` type surface** — commands give other extensions and
  agents a driving surface without committing to an untestable API before a
  consumer exists.
- **Cross-source dependencies** — a Silo task blocked by a Beads task has no way
  to stay consistent. Sources are independent graphs.
- **A kanban board, calendar, time tracking, team features, cloud sync, an MCP
  server, or a second persistent store of canonical task state.**
- **Multiple folders per workspace** — detection resolves against the primary
  folder.
- **Multi-writer coordination beyond compare-and-swap** — no lock file, no
  journal, no embedded store.

## Alternatives considered

- **One provider per workspace (exclusive).** Rejected: declining a migration
  leaves tasks that still exist but are invisible. Additive sources dissolve the
  problem.
- **Adopt dex's file format as Silo's native store.** Rejected once Silo Tasks
  became the primary product — dex has no labels, assignees, or due dates, so
  adopting its schema caps the feature set to preserve a round-trip most users
  never perform.
- **A `TaskProviderCapabilities` flag object.** Rejected — absence is
  expressible in data, and optional methods carry the rest.
- **Beads-first, Silo storage as a fallback** (the original plan). Reversed: it
  makes the extension useless to anyone not already running Beads, and `bd
init`'s repo modifications make Beads a poor default.
- **A generic `project` taxonomy that workspaces map into.** Rejected — labels
  are core, filterable, and cross-source, and cover the case.
- **Phase 2: derive an inactive workspace's storage dir in-extension.** Rejected
  as the primary plan (Option B); the SDK documents the path shape as
  non-contractual.
- **Phase 2: default `workspaceDir`'s new `create` option to `false`.** Reads
  cleaner in isolation, but `writeText` does not create parent directories and
  every existing RFC 0032 caller relies on `workspaceDir()` having made the dir.
- **Phase 2: fan out `workspaceDir(id)` per open workspace** instead of a
  `workspaceDirs()` batch. Rejected — N host round-trips and N littered empty
  directories at `create: true`.
- **Phase 2: a dock panel kind (a real tab) instead of `openPanelSheet`.**
  Rejected — the proposal commits to an anchored, non-modal, dismissible sheet,
  not a persistent tab.
- **Phase 2: the sheet's list page byte-identical to the panel's rows.**
  Revised after a design review — a 720px surface under-uses its width with
  250px rows; the sheet got its own multiline row, composer, and batch bar.
- **Phase 2: a shared `AggregatedList` with the panel left as a separate
  implementation.** Widened to `TasksBody` — the one shell all three surfaces
  mount, so the panel isn't a second implementation of the same list.

## Related decisions

- [RFC 0032](../0032-ctx-extension-storage-directory.md) — the per-extension
  storage directory and `ctx.files` own-dir sandbox lift; phase 2 extended its
  `workspaceDir()` and added `workspaceDirs()`.
- [ADR 0022](../decisions/0022-on-disk-storage-layout.md) — three-tier on-disk
  layout; task data is tier 1, reached only via 0032's directories.
- [ADR 0026](../decisions/0026-sdk-component-set.md) — the design-system kit is
  the source for content components; panel and sheet chrome stay bespoke where
  `docs/side-panel-design.md` / `docs/modal-design.md` say so.
- [ADR 0017](../decisions/0017-css-theming-contract.md) — extension CSS uses
  design tokens only.
- [ADR 0038](../decisions/0038-navigator-view-list.md) — the Navigator lists its
  views; register **one** view, controls are toolbar items, set an `icon`.
- [RFC 0021](../0021-follow-ups-extension-sdk.md) — Follow-ups, the adjacent
  concept the glossary disambiguates Task from.
- [ADR 0045](../decisions/0045-ephemeral-change-planning.md) — the
  change-planning convention this proposal's phased collapse follows.

## Decision

**Accepted** 2026-08-30. **Phase 1 implemented** and collapsed 2026-09-01.
**Phase 2 implemented** and collapsed 2026-09-07 — verified by a full manual
visual pass plus the extension's green `npm test` / `tsc` / `npm run build`.
`status` stays `accepted` while phases 3–5 remain. The original phase 2 was
split in two on 2026-09-01 (see **Phases**); phases 3–5 are the old 2–4 shifted
down. Phase 3 re-expands into a fresh planning package when that work is ready.
