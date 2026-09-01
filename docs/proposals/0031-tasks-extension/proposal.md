---
status: accepted # phase 1 implemented; phase 2 in planning; phases 3–5 remain
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

**Phase 1 has shipped** — the Silo provider, the global and per-workspace lists,
the side panel with group/filter/sort/search, drill-in detail, and
create/edit/complete/delete. Phases 2–5 (below) are still planned.

## Planning scope

**This package plans phase 2 only.** Phase 1 is implemented, verified, and
collapsed; treat it as the current baseline. Phases 3–5 are not planned here.

### What phase 2 delivers

The two **aggregating surfaces** — the ones that show tasks from more than one
source at once:

1. **The Navigator cross-workspace view** — a registered Navigator view
   (`ctx.registerNavigatorView`) that lists every open workspace's Silo tasks
   plus the global list in one place, grouped by workspace, with the same
   filter/sort/search/group controls and drill-in detail the side panel has.
2. **The Tasks app dock sheet** — a dock-anchored, non-modal sheet
   (`ctx.layout.openPanelSheet`) presenting the same aggregated list in a wider,
   full-height layout, opened from a command.

Both are pure UI over the **phase-1 provider seam**. The only new data-layer
work is resolving a Silo `TaskSource` for **every open workspace** rather than
just the active one — the payoff the phase-1 `source-set` store was built for
("loaded and watched once, owned by the source set, not the panel — the
multi-consumer payoff lands with phase 2's Navigator view").

### What phase 2 explicitly does NOT touch

No second provider. Beads and dex, tracker detection, per-workspace provider
enablement, the "new tasks go to" destination choice, provider-rendered detail
sections from a real second/third provider, and subprocess file-watched refresh
are all **phase 3**. Writes across providers are phase 4; decorations are phase 5. (The original phase 2 bundled the aggregation surfaces with the Beads/dex
work; they were split on 2026-09-01 — see the note under **Phases**.)

### Phase-1 corrections phase 2 must preserve

- **Preferences use `ctx.storage.global` keyed by workspace id**, never
  `SidePanelProps.storage` / `ctx.storage.workspace` (which drop everything when
  no workspace is open). The cross-workspace view is not per-workspace, so it
  needs its own prefs key — it must not reuse or clobber a workspace's key.
- **No `providerId` under `src/ui`** — the new view and sheet render through the
  same generic seam; the `boundaries.test.ts` grep assertion extends to them.
- **The global source always exists and is listable with no workspace open** —
  the Navigator view and the sheet must both render in that state.
- **No "new tasks go to" picker** — creating from a cross-workspace surface is
  the phase-3 destination question; phase 2's `New task` action reuses the
  phase-1 command (reveal the side panel, focus quick-add).

### Cross-repository dependency (open decision)

The phase-1 `ctx.storage.workspaceDir()` resolves the **active** workspace's
directory only, and creating the directory is a side effect of the call. The
cross-workspace view needs a path for **every** open workspace, without the
create side effect. `design.md` weighs two options and recommends **Option A —
extend `ctx.storage`** in **`silo-code/silo`**:

- `workspaceDir(workspaceId?: string, options?: { create?: boolean })` — resolve
  any workspace's dir (not just the active one); `options.create` **defaults to
  `true`** because every existing RFC 0032 caller writes into the result without
  calling `createDir` and `writeText` does not create parent dirs — so
  `create: false` as the default would break them (the Tasks extension included).
- `workspaceDirs(options?: { create?: boolean })` — one call resolves a path per
  open workspace, so the aggregation layer does not fan out N calls.

This triggers the `silo-docs-sync` workflow and an `@silo-code/sdk` + app
release the extension then floors on. **It is the one decision that gates phase
2's sequencing** and needs sign-off before implementation starts. Option B
(derive the path in-extension) is a fallback only — the SDK documents the path
shape as non-contractual.

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
in the field and requires an explicit save/restore step. Silo's workspaces never
tear down, so binding a task to one is nearly free. This proposal does not build
that (see Non-goals), but it is why the architecture keeps a task's workspace
association **derivable, never stored**.

**Phase 2 specifically:** phase 1 gave each workspace a task list, but every list
is walled inside its own workspace — to see what is outstanding across projects
you switch workspaces one at a time. The cross-workspace view answers "what is on
my plate everywhere" in one place, and the app sheet gives that same answer the
room a ~250px side panel cannot. Both are the reason the phase-1 store was built
as a shared, always-on resource rather than something the panel owns.

## Architecture

### The Task Source

A **Task Source** is one resolved store of tasks; everything else hangs off it. A
source is identified by its **locator** and is either:

- **Silo-managed** — a file Silo owns, outside any repo. One always-present
  **global** source ("Personal") and optionally one per workspace.
- **Repo-derived** — a third-party tracker detected in a workspace folder (phase
  3+).

The provider (Silo, Beads, dex) is an implementation detail _of_ a source. Two
workspaces that are worktrees of the same repository resolve to the **same**
source — the locator is a dedupe key. Providers are **additive per workspace**: a
workspace may have any number of sources enabled at once (phase 3+).

### The normalized model: LCD core, provider-rendered detail

The core `Task` schema holds **only what the list sorts, filters, groups, or lays
out by**:

```
id · sourceId · title · lane · statusLabel · priority · rank ·
parentId · labels · assignees · updatedAt
```

- `lane` is the closed set `todo | in_progress | blocked | done` that every
  provider maps into; `statusLabel` carries the provider's own word so nothing is
  lost in display.
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

### Phase 1 implementation

Everything below is live in `silo-extensions/tasks/`.

- **Storage.** NDJSON, one `SiloTaskRecord` (`v: 1`) per line, trailing newline,
  at `<globalDir()>/tasks.jsonl` and `<workspaceDir()>/tasks.jsonl` — RFC 0032's
  per-extension directories, tier-1 user data (ADR 0022). The person can find,
  `grep`, back up, and point an agent at it. `permissions: []` — RFC 0032's
  sandbox lift reaches an extension's own directory through `ctx.files` with no
  `fs:read` / `fs:write`.
- **Write strategy.** Whole-file rewrite to a dotted sibling `.tasks.jsonl.tmp`
  then `rename` — a process crash mid-write never truncates the real file. A
  stale `.tmp` is overwritten, not accumulated.
- **Compare-and-swap.** The storage pitch is that an agent or a hand-edit can
  append to `tasks.jsonl`, so every mutation re-`stat`s immediately before the
  rename and, if size or mtime changed since the load, reloads and re-applies
  rather than clobbering. Bounded retry; exhaustion rejects and leaves the file
  untouched. Mutations are serialized per store. The residual race — a write
  landing inside the final stat→rename gap — is **documented in the extension
  README as a known limitation**, not designed away; a lock file is not worth its
  failure modes at personal-list scale.
- **Unparsed-line preservation.** A line that fails to parse (a typo, a record
  from a newer Silo, a higher `v`) is kept verbatim at its index and re-emitted
  on the next write — never silently dropped, and it does not abort the load of
  surrounding lines. A malformed file surfaces one non-blocking notice naming the
  path; it does not re-notify while the unparsed set is unchanged.
- **Two sources.** The global source always exists (listable with no workspace
  open); the active workspace's source resolves when a workspace is open.
  `workspaceDir()` rejecting with `NoWorkspaceError` specifically maps to "no
  workspace source"; any other rejection is a real fault. Sources are loaded and
  watched **once**, owned by a `source-set` reactive store created in `activate`,
  not by the panel — so lazily mounting/unmounting the panel neither reloads nor
  drops the watch (the multi-consumer payoff lands with phase 2's Navigator
  view).
- **Freshness.** `ctx.files.watch` on the source's **directory** (not the file —
  the atomic rename replaces the inode), filtered to the `tasks.jsonl` basename,
  debounced ~150ms. Self-write suppression is **content-based** (compare reloaded
  bytes to the last write), not a timing window, so the "no reload loop"
  behaviour is deterministic and its test is not clock-dependent.
- **Side panel.** Registered via `ctx.registerSidePanel` with `lazyMount: true`,
  following `docs/side-panel-design.md`: actions row (`Group by ▾`, `Filter ▾`,
  refresh, new) above an inline `SearchInput`; `.silo-scroll` body; design tokens
  only (verified against the monorepo's `silo/extension-design-tokens-only`
  rule); SDK `Tooltip` everywhere, never native `title`; the shared
  `:focus-visible` ring.
- **Row vocabulary.** One line: status glyph (hollow ring / half-filled / struck
  ring / filled check) · title · priority mark (up arrow = high, the only one
  coloured; dash = normal; down = low). **No task id in the row** — it lives in
  the tooltip and the detail page. The provider a task came from is never shown.
- **Grouping** is a toolbar control (ADR 0038), not a second view: `None`,
  `Source` (panel default), `Status`, `Label`. `Label` fans a multi-label task
  into every matching group with a trailing "No label" group. `Source` is the
  panel default because R7 forbids a per-row provider badge and leans on the
  group header to separate the always-present global list from the workspace
  list; a single non-empty source collapses to one unlabelled group, so the
  no-workspace case still reads flat.
- **Drill-in detail** replaces the list page entirely (`.panel-back` contract,
  `Escape` pops one page, never closes the panel). Edits title, lane, priority,
  labels, description, due date, and acceptance criteria. The three fields the
  design-system kit does not cover use the simplest thing that meets the
  requirement rather than a hand-rolled widget: **labels** = a kit `Input` with a
  comma-separated list (trimmed, de-duped on commit); **due date** = a native
  `<input type="date">` styled with design tokens (the first panel control with
  no kit component behind it — recorded in the side-panel design working log);
  **acceptance criteria** = kit `CheckboxRow` + `AddRow`. The open task is **not**
  persisted — a restart returns to the list.
- **Quick-add** is a bottom-docked title input + square `Plus` button, no
  destination picker: it always creates in the active workspace's source, falling
  back to the global list when no workspace is open, and the button names the
  destination ("Add to Repo" / "Add to Personal").
- **Commands** (the driving surface, in place of a published `TasksApi`):
  `silo.tasks.new`, `silo.tasks.newInGlobal`, `silo.tasks.refresh`,
  `silo.tasks.complete`. None silently do nothing from an argument-less
  keybinding — the create commands reveal the panel and focus quick-add;
  `complete` with no argument completes the drilled-into task or reveals the
  panel and notifies. `complete` with an unknown id rejects naming the id and
  mutates nothing.
- **Preferences** (group, filter, sort, search, collapsed group headers) persist
  in `ctx.storage.global` keyed by workspace id, with a `"global"` key for the
  no-workspace case — **not** `SidePanelProps.storage` / `ctx.storage.workspace`,
  which are the per-workspace bag persisted into the workspace record and would
  drop everything when no workspace is open (a case that must work). Read only
  after the store reports hydration; re-read when it flips.

## Phases

| Phase     | Scope                                                                                                                                                                                                                              | Status                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **1**     | Silo provider only — global + per-workspace lists, side panel, list with filter/sort/search, drill-in detail, create/edit/complete/delete. No provider UI, because there is nothing to choose.                                     | **Implemented** — `silo-extensions` `tasks/` |
| **2**     | The **Navigator cross-workspace view** and the **Tasks app dock sheet** — two aggregating surfaces that show every workspace's list plus the global one in one place, built over the phase-1 Silo provider seam. No new providers. | **In planning** — this package               |
| **3**     | Beads **and** dex together. Detection offers, per-workspace enablement, "new tasks go to", provider-rendered detail sections from a real second/third provider, file-watched refresh for subprocess providers.                     | Planned                                      |
| **4**     | Writes across providers; move/migrate between sources with lossy-field warnings and dependency-id remapping.                                                                                                                       | Planned                                      |
| **5**     | Decorations — workspace badges, status rows, status bar — all **default off**.                                                                                                                                                     | Planned                                      |
| **Later** | Backlog.md, Linear, GitHub Issues; Silo CLI for agent access; Start Task.                                                                                                                                                          | Planned                                      |

**Phase 2 was split out of the original phase 2** (2026-09-01). The original
phase 2 bundled the cross-workspace aggregation surfaces with the Beads/dex
provider work. They separate cleanly: the Navigator view and the Tasks app sheet
are pure UI over the seam phase 1 already shipped and need no second provider to
build or to prove, while Beads + dex is a self-contained chunk with its own risk.
Splitting them lets the multi-consumer payoff the phase-1 `source-set` store was
built for land first, on the one provider that already exists. Every later phase
shifted down one number; nothing was dropped.

Phase 3 pairs Beads and dex deliberately: they are maximally different
(subprocess + Dolt + rich dependency graph vs. a plain file with no labels and no
assignees), and with Silo as a superset that gives one provider _richer_ than the
core schema and one _poorer_ — the actual test of whether the LCD line is drawn
correctly. Every phase must stand on its own for a human user; agent integration
is additive and must not depend on the unshipped CLI work.

Phase 1 built the **full provider seam** (`TaskSource`, the normalized core
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
  closing/deleting a workspace removes its source from the panel without touching
  the file.
- A task's id is unique within its source and stable for its lifetime. The
  workspace a task belongs to is **derived** from its source at render time,
  never stored in task data.
- `parentId`, `assignees`, and `rank` are carried and round-tripped but no
  phase-1 surface reads or writes them (no nesting UI, no assignee picker, no
  drag-reorder). They are in core because the schema is fixed across providers.
- Everything beyond the core schema reaches the UI only through detail-section
  descriptors; an unknown `kind` is skipped, not thrown on. No view references
  `providerId`.
- `TaskProvider` action methods are optional; a UI control for an unavailable
  action is absent or disabled based on `typeof provider.<method>`.
- An external change to `tasks.jsonl` is reflected in the panel within roughly
  half a second with no manual refresh; the extension's own writes do not cause a
  reload loop.
- Every mutation persists immediately and survives an app restart; a failed write
  surfaces an error and leaves the in-memory list matching disk.
- Grouping, filtering, sorting, and search are pure functions over `Task[]`,
  unit-testable without rendering; sort is stable.

## Key decisions made during planning

- **`priority` is a core-schema field**, not detail — the list sorts by it and
  every row renders it.
- **Storage follows RFC 0032's directory shape** — `globalDir()/tasks.jsonl` and
  `workspaceDir()/tasks.jsonl`, not a shared directory with `ws-<id>` prefixes;
  0032 already namespaces per workspace.
- **No "new tasks go to" setting in phase 1** (reversing an earlier correction).
  A two-Silo-source panel doesn't warrant a persisted default plus a one-off
  override menu. The active-workspace-with-global-fallback rule plus
  `silo.tasks.newInGlobal` covers it. A real destination choice returns in phase
  3 when detected third-party providers make "which of several sources" a genuine
  question.
- **The Silo provider watches its own file in phase 1.** The phase table deferred
  `ctx.files.watch` to a later phase; for a plain file the extension already owns, it's
  a few lines and phase 1's storage pitch (an agent appends to the `.jsonl`)
  makes it mandatory.
- **A patch's non-core fields travel through the descriptor channel** (`key` →
  `providerFields[key]`), not as provider-named keys on the shared `TaskPatch`.
- **`toDetailSections` always emits the description / due-date / acceptance-
  criteria sections** (empty-valued when absent) so their editors are always
  reachable — R10 requires those three to be editable. The "no empty sections for
  absent optionals" rule applies instead to schema fields the core model doesn't
  carry (`assignees`, `parentId`, `closedAt`), which produce nothing.
- **No ADR for the LCD core + descriptor channel.** It binds nothing outside this
  extension today, is not public SDK surface, and its rationale lives here.
  Revisit when a **second** aggregating surface adopts the same seam — at that
  point it becomes a contract with two implementations to generalize from rather
  than one to guess at. **(Phase 2 is that second surface — re-evaluate at
  collapse; the current recommendation in `design.md` is still no ADR, because
  the second consumer is the same extension, not an independent one.)**
- **Windows.** The predicted `resolve-path.ts` POSIX-only gap — a `permissions:
[]` own-dir write with a drive-absolute path failing with `ERROR_INVALID_NAME`
  — was **fixed in RFC 0032** (`silo-code/silo` #473): that module now recognizes
  Windows drive and UNC anchors. The residual `fs_rename` → `MoveFileEx` caveat
  (overwrites, but not the POSIX atomicity guarantee, and fails outright on a
  sharing violation) is documented in the extension README; if it bites in
  practice it is filed against RFC 0032, not worked around in the extension.

## Implementation

- **Repo / package:** `silo-code/silo-extensions`, `tasks/`, package
  `@silo-extensions/tasks`, manifest id `silo.tasks`, `publisher` `"Silo"`,
  `permissions: []`. Added in `silo-extensions` #100. **Phase 2's UI work lands
  here too; the `ctx.storage` extension (Option A — `workspaceDir` params +
  `workspaceDirs()`) lands in `silo-code/silo`** and ships in an `@silo-code/sdk`
  - app release the extension
    then floors on (`silo.engine` + the `@silo-code/sdk` devDependency).
- **Layout:** `model/` (pure types), `lib/` (pure `ids` / `view` / `prefs`),
  `providers/silo/` (`jsonl`, `record`, `file-store`, `provider`) + `registry`,
  `sources/source-set` (the one reactive store), `ui/` (panel, toolbar, list,
  row, detail, generic descriptor renderer, quick-add, glyphs, CSS). Internal
  layering mirrors the repo's: `ui → {model, lib, sources}`, `sources → {model,
providers}`, `providers → model`; nothing under `model/` or `lib/` imports
  React or `ctx`. Phase 2 adds `ui/CrossTasksView.tsx`, `ui/TasksAppSheet.tsx`,
  and a shared `ui/AggregatedList.tsx`; `source-set` grows from 2 sources to
  N + 1 (see `design.md`).
- **Tests:** co-located Vitest, pure-logic style — `jsonl`, `record`, `view`,
  `ids`, `file-store` (absent file, tmp-then-rename, CAS reload/re-apply, retry
  exhaustion, serialization, content-based self-write suppression), `provider`,
  `source-set`, `prefs`, `commands`, and a grep-based `boundaries` assertion.
  `FileService` is faked in-memory at the `ctx.files` seam.
- **Dependencies / sequencing:** phase 1 requires RFC 0032's
  `ctx.storage.globalDir()` / `workspaceDir()` and the `ctx.files` own-dir
  sandbox lift — shipped in `@silo-code/sdk` **0.42.0** and Silo app **0.59.0**.
  The two pins are different numbers by design: `silo.engine: "^0.59.0"` is a
  floor on the **host app** (`engine-compat.ts` checks it against the running
  Silo); the `@silo-code/sdk: "^0.42.0"` devDependency names the **npm package**
  whose types carry the methods. The extension is **not published to the registry
  in phase 1** — it is installable from a built folder, and users on an app older
  than 0.59.0 are gated by `silo.engine` until that release ships.
- **Docs:** `docs/domain-language.md` gained a **Tasks** section (Task, Task
  Source, Lane, Ready; Task pinned to the intent, never an agent run; Task vs.
  Follow-up; Beads' "beads workspace" must not reach the UI). Phase 2 adds
  **Tasks app** (the aggregated cross-workspace surface).
  `docs/side-panel-design.md`'s working log records the token-styled native date
  input. `docs/silo-extensions-repo.md` and `silo-extensions/README.md` list
  `tasks/`. `silo.tasks` gets **no row** in `apps/docs/roadmap.md` — that table
  is for bundled `core.*` / `silo.*` packages, and this ships external. (The
  phase-2 `ctx.storage` extension does get a one-line note under the existing
  `ctx.storage` roadmap row.)

## Non-goals

- **Start Task / agent binding / the Silo CLI** — deferred until Agent Profiles
  make the flow obvious. Noted as a risk: all twelve surveyed tools converge on
  the task list's job being to launch work.
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
  leaves tasks that still exist but are invisible, and it makes "try dex, go
  back" a scary one-way door. Additive sources dissolve the problem.
- **Adopt dex's file format as Silo's native store.** Attractive while Silo
  storage was a stopgap. Rejected once Silo Tasks became the primary product —
  dex has no labels, assignees, or due dates, so adopting its schema caps the
  feature set to preserve a round-trip most users never perform. Interop is
  export plus the provider model.
- **A `TaskProviderCapabilities` flag object** (the superseded PRD's nine
  booleans). Rejected — absence is expressible in data, and optional methods
  carry the rest, without a second thing to keep in sync.
- **Beads-first, Silo storage as a fallback** (the original plan). Reversed: it
  makes the extension useless to anyone not already running Beads, and `bd
init`'s repo modifications make Beads a poor default for repos you don't own.
- **A generic `project` taxonomy that workspaces map into.** Rejected as a second
  taxonomy for a case labels already cover — labels are core, filterable, and
  cross-source.
- **Phase 2: derive an inactive workspace's storage dir in-extension** (string
  ops off `globalDir()`) instead of extending the SDK. Rejected as the primary
  plan — the SDK documents the path shape as non-contractual; see `design.md`.
  Kept only as a bridge (behind `resolveWorkspaceTasksDir`) if the SDK change
  slips.
- **Phase 2: default `workspaceDir`'s new `create` option to `false`.** Reads
  cleaner in isolation, but `writeText` does not create parent directories and
  every existing RFC 0032 caller relies on `workspaceDir()` having made the dir —
  so `false` as the default breaks them. Default `true`; `false` is opt-in.
- **Phase 2: fan out `workspaceDir(id)` per open workspace** instead of a
  `workspaceDirs()` batch. Rejected — N host round-trips and, at the default
  `create: true`, N empty directories littered for workspaces that have no
  tasks.
- **Phase 2: a dock panel kind (a real tab) instead of `openPanelSheet`.** The
  proposal commits to a "dock sheet" — anchored, non-modal, dismissible — not a
  persistent tab the user manages. `design.md` records the reasoning.

## Related decisions

- [RFC 0032](../0032-ctx-extension-storage-directory.md) — the per-extension
  storage directory and `ctx.files` own-dir sandbox lift this depends on; phase 2
  may extend its `workspaceDir()`.
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
- [ADR 0045](../decisions/0045-ephemeral-change-planning.md) — the change-planning
  convention this proposal's phased collapse follows.

## Decision

**Accepted** 2026-08-30. **Phase 1 implemented** and collapsed 2026-09-01;
`status` stays `accepted` while phases 2–5 remain. The original phase 2 was
split in two on 2026-09-01 (see the note under **Phases**); phases 3–5 are the
old 2–4 shifted down. **Phase 2 re-expanded into this planning package on
2026-09-01** — `requirements.md` / `design.md` / `tasks.md` are scoped to phase 2
only and are deleted at collapse.
