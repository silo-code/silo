# Design — 0031. Tasks extension (phase 1)

How the phase-1 requirements are satisfied. Working artifact — removed when the
proposal collapses.

## Architecture

The implementation lands in the **external** `silo-code/silo-extensions` repo
(cloned at `../silo-extensions`), as a new top-level folder `tasks/` — its own
npm package, built with esbuild, consuming the **published** `@silo-code/sdk`.
Nothing in this monorepo changes except `docs/`.

```
silo-extensions/tasks/
├── package.json          @silo-extensions/tasks · silo.id "silo.tasks" · permissions []
├── build.mjs             esbuild → dist/index.js (react, react/jsx-runtime, @silo-code/sdk external)
├── tsconfig.json         extends ../tsconfig.base.json
├── vitest.config.ts
├── README.md
└── src/
    ├── index.ts                 activate/deactivate; all registrations
    ├── model/
    │   ├── task.ts              Task, TaskLane, TaskPriority, TaskDraft, TaskPatch
    │   ├── detail.ts            DetailSection union
    │   └── source.ts            TaskSource, TaskProvider
    ├── providers/
    │   ├── registry.ts          providerId → TaskProvider
    │   └── silo/
    │       ├── record.ts        SiloTaskRecord, schemaVersion, record ⇄ Task mapping
    │       ├── jsonl.ts         pure parse/serialize, unparsed-line preservation
    │       ├── file-store.ts    one source's file: load, mutate, atomic write, watch
    │       └── provider.ts      SiloTaskProvider (implements TaskProvider)
    ├── sources/
    │   └── source-set.ts        resolves + owns the live sources; the reactive store
    ├── lib/
    │   ├── ids.ts               task id generation
    │   ├── view.ts              pure group / filter / sort / search over Task[]
    │   └── prefs.ts             persisted panel prefs + "new tasks go to"
    └── ui/
        ├── TasksPanel.tsx       root: list page or detail page
        ├── TasksToolbar.tsx     actions row + SearchInput
        ├── TaskList.tsx         groups + rows
        ├── TaskRow.tsx          glyph · title · priority
        ├── TaskDetail.tsx       drill-in page
        ├── DetailSections.tsx   generic descriptor renderer
        ├── QuickAdd.tsx         create row with destination + override
        ├── glyphs.tsx           StatusGlyph, PriorityMark
        └── tasks.css            design tokens only
```

The layering rule inside the package mirrors the repo's own: `ui/` may import
`model/`, `lib/`, and `sources/`; `sources/` imports `model/` and `providers/`;
`providers/` imports `model/` only. Nothing under `model/` or `lib/` imports
React or `ctx`, which is what makes them unit-testable as pure logic.

## Components

### `model/task.ts` — the normalized core

```ts
export type TaskLane = "todo" | "in_progress" | "blocked" | "done";
export type TaskPriority = "high" | "normal" | "low";

export interface Task {
  readonly id: string;
  readonly sourceId: string;
  readonly title: string;
  readonly lane: TaskLane;
  /** The provider's own word for the status — display only. */
  readonly statusLabel: string;
  readonly priority: TaskPriority;
  /** Manual ordering key within the source; lexicographically sortable. */
  readonly rank: string;
  readonly parentId: string | null;
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
  readonly updatedAt: number;
}
```

`priority` is in core (see the proposal's corrections) because the list sorts by
it and every row renders it. `rank` is a string so a task can be inserted between
two neighbours without renumbering the file; phase 1 generates ranks with a
simple midpoint scheme and never exposes drag-reordering, but the field exists so
phase 2's table can.

`TaskDraft` is what `createTask` accepts (`title` required, everything else
optional). `TaskPatch` is a partial of the editable fields — including the
non-core Silo fields, which the provider knows how to apply and other providers
would ignore.

### `model/detail.ts` — the descriptor channel

```ts
export type DetailSection =
  | { kind: "text"; label?: string; value: string }
  | { kind: "field"; label: string; value: string }
  | {
      kind: "checklist";
      label: string;
      items: readonly { text: string; done: boolean }[];
    };
```

Plain data, no React, no functions — serializable and directly assertable in a
test. `taskLinks` (Beads' dependency sections) is deliberately **not** added
here: a union member is additive and non-breaking, and phase 1 has no producer
for it. Three kinds with three different shapes is already enough to prove the
renderer is generic.

`DetailSections.tsx` switches on `kind` and returns `null` for anything it does
not recognize, so a provider built against a newer descriptor set degrades to
"section missing" rather than a crashed panel.

### `model/source.ts` — sources and providers

```ts
export interface TaskSource {
  readonly id: string; // stable hash of `${providerId}:${locator}`
  readonly providerId: string; // "silo"
  readonly locator: string; // absolute path to tasks.jsonl in phase 1
  readonly scope: "global" | "workspace";
  readonly workspaceId?: string;
  readonly name: string; // "Personal" | the workspace's name
}

export interface TaskProvider {
  readonly id: string;
  readonly displayName: string;
  list(source: TaskSource): Promise<readonly Task[]>;
  detail(source: TaskSource, taskId: string): Promise<readonly DetailSection[]>;
  createTask?(source: TaskSource, draft: TaskDraft): Promise<Task>;
  updateTask?(
    source: TaskSource,
    taskId: string,
    patch: TaskPatch,
  ): Promise<Task>;
  setLane?(source: TaskSource, taskId: string, lane: TaskLane): Promise<Task>;
  deleteTask?(source: TaskSource, taskId: string): Promise<void>;
  watch?(source: TaskSource, onChange: () => void): Disposable;
}
```

Optional methods carry action capability; data capability is expressed in the
data (a provider with no labels returns `labels: []`). There is no capability
flag object — `if (provider.createTask)` is type-safe and cannot drift out of
sync with what the provider actually implements.

`locator` being "the absolute path" is a phase-1 shape, not a permanent one —
Beads' locator will be the `bd where --json` workspace path, which is also a
path. The important property is that a locator is a **dedupe key**: two
workspaces resolving to the same locator are one source.

### `providers/silo/record.ts` — the on-disk shape

```ts
export interface SiloTaskRecord {
  v: 1; // schemaVersion
  id: string;
  title: string;
  lane: TaskLane;
  priority: TaskPriority;
  rank: string;
  parentId?: string | null;
  labels?: string[];
  assignees?: string[];
  description?: string;
  acceptanceCriteria?: { text: string; done: boolean }[];
  dueDate?: string; // ISO date
  createdAt: number;
  updatedAt: number;
  closedAt?: number | null;
}
```

Deliberately a **superset** of `Task`: the record is the product, the core model
is the lowest common denominator across providers. `record.ts` owns both
directions — `toTask(record, sourceId)` and `toDetailSections(record)` — so the
core/detail split lives in exactly one file, and everything the record has that
`Task` lacks is provably reachable only through descriptors.

`statusLabel` for the Silo provider is the human word for the lane
(`"Todo" | "In progress" | "Blocked" | "Done"`), which is what makes the field
non-redundant the moment a provider with its own vocabulary (Backlog.md's
configurable statuses) shows up.

Unknown keys on a record are preserved through a load/save round trip, so a
future field written by a newer Silo does not get stripped by an older one.

### `providers/silo/jsonl.ts` — pure

```ts
export interface ParsedFile {
  readonly records: readonly SiloTaskRecord[];
  /** Lines that failed to parse or validate, kept verbatim, with their index. */
  readonly unparsed: readonly { index: number; line: string }[];
}
export function parseJsonl(text: string): ParsedFile;
export function serializeJsonl(file: ParsedFile): string;
```

The `unparsed` channel is the load-bearing bit of R1: a hand-edited typo on line
7 must not cost the user lines 1–6 or line 8, and must not be quietly erased on
the next write. `serializeJsonl` re-emits unparsed lines at their original
indices. No I/O in this module.

### `providers/silo/file-store.ts` — one file, one owner

Wraps `ctx.files` for a single source path:

```ts
createFileStore(files: FileService, path: string): {
  load(): Promise<ParsedFile>;
  mutate(fn: (records: SiloTaskRecord[]) => void): Promise<ParsedFile>;
  watch(onExternalChange: () => void): Disposable;
}
```

- **Read**: `stat` → absent means empty; present means `readText` + `parseJsonl`.
- **Write**: `writeText` to `${path}.tmp`, then `rename` to `path`. `ctx.files`
  gives both, and rename-over is atomic on POSIX, which satisfies R1's
  no-truncation criterion without a lock file.
- **Serialize**: mutations queue on a single in-flight promise chain per store,
  so two rapid edits can't interleave read-modify-write.
- **Self-write suppression**: each write records the path and a timestamp;
  watch events arriving within a short window of the extension's own write are
  ignored, which is what keeps R11's "no reload loop" true.

The store is the only module that touches the filesystem. Every test above it
fakes `FileService`.

### `sources/source-set.ts` — the reactive store

The one stateful object in the extension. It:

- resolves the current sources — always the global one, plus the active
  workspace's when `ctx.workspaces.getState().activeId` is non-null;
- owns one `file-store` per source and the loaded `Task[]`;
- exposes the `ReactiveService` shape (`getState()` returning a frozen
  `{ sources, tasksBySource, loading, error }`, `subscribe(listener)`), so the
  panel reads it with the SDK's `useServiceState` rather than hand-rolled
  `useSyncExternalStore`;
- subscribes to `ctx.workspaces` and re-resolves on active-workspace change,
  disposing the departing workspace store's watch.

Because the source set is created once in `activate` and owned by the extension
rather than the panel, the panel can be lazily mounted and unmounted without
reloading, and R2's "loaded once, not per consumer" holds for free when phase 2
adds the Navigator view.

The storage directories are resolved once during `activate`:
`await ctx.storage.globalDir()` and, per workspace, `await ctx.storage.workspaceDir()`.
Both are awaited before the first resolve, and `workspaceDir()` rejects with no
workspace open — that rejection is expected and maps to "no workspace source",
not to an error surface.

### `lib/view.ts` — pure list transformation

```ts
export interface ViewPrefs {
  groupBy: "none" | "status" | "source" | "label";
  sortBy: "rank" | "updated" | "priority" | "title";
  showDone: boolean;
  labelFilter: readonly string[];
  query: string;
}
export interface TaskGroup {
  key: string;
  title: string;
  tasks: readonly Task[];
}
export function buildView(
  tasks: readonly Task[],
  sources: readonly TaskSource[],
  prefs: ViewPrefs,
): TaskGroup[];
```

One entry point, no React, no `ctx`. Every acceptance criterion in R8 is a case
in `view.test.ts`. Sorting composes a comparator and uses a stable sort;
`groupBy: "none"` returns a single unnamed group so the renderer has one shape.

Search matches title (case-insensitive substring), labels, and an exact id — the
id case is what keeps R7's "no id in the row" from making a task unfindable when
an agent hands the user an id.

### `ui/TasksPanel.tsx` — the panel root

Holds one piece of local state — `openTaskId: string | null` — which decides
list page vs. detail page. Everything else is either the reactive source-set
state or persisted prefs.

Chrome follows [`docs/side-panel-design.md`](../../side-panel-design.md):
actions row above `SearchInput`, 26×26 icon hits with `gap: 2px`,
`ArrowsClockwise` at `size={14}` for refresh, `4px` panel inset, `8px` row
content pad, `.silo-scroll` on the body, `font-family` only on the root, and
`.silo-list-row { font-size: 1em }`.

Drill-in follows the same doc's contract: the detail page **replaces** the list
page (search and toolbar unmount, not hide), a quiet `.panel-back` accent
control leads it, secondary tools sit right-aligned on the Back row, the primary
action sits on the title row, and `Escape` pops one page.

Kit components used: `SearchInput`, `List`/`ListRow`, `Section`, `Badge`,
`Button`, `IconButton`, `MenuButton` (Group by / Filter), `EmptyState`,
`InlineEdit` (title), `Textarea` (description), `Select` (lane, priority),
`CheckboxRow` (acceptance criteria), `AddRow` (quick add), `Tooltip`. Nothing
hand-rolled that the kit covers.

## Data flow

**Activation**

```
activate(ctx)
 ├─ providers.register(new SiloTaskProvider(ctx.files))
 ├─ globalDir  = await ctx.storage.globalDir()
 ├─ sourceSet  = createSourceSet(ctx, providers, globalDir)
 │    └─ resolve() → [global] (+ [workspace] if activeId)
 │         └─ per source: fileStore.load() → parseJsonl → toTask[] → notify
 ├─ ctx.workspaces.subscribe(→ sourceSet.resolve())
 ├─ ctx.registerSidePanel({ id: "silo.tasks.panel", location: "right", lazyMount: true })
 └─ ctx.registerCommand(new | newInGlobal | refresh | complete)
```

**Creating a task**

```
QuickAdd submit(title, destinationOverride?)
 └─ sourceSet.create(destination, { title })
      └─ provider.createTask(source, draft)
           └─ fileStore.mutate(records => records.push(newRecord()))
                ├─ load + parse (fresh — never a stale in-memory copy)
                ├─ writeText(`${path}.tmp`) → rename(tmp, path)
                └─ mark self-write
      └─ sourceSet re-derives Task[] and notifies → panel re-renders
```

**An agent appends a line to `tasks.jsonl`**

```
ctx.files.watch(<source dir>) → change event
 └─ within self-write window? → ignore
 └─ else debounce 150ms → fileStore.load() → notify → panel re-renders
```

## APIs / interfaces

**No `@silo-code/sdk` change.** Phase 1 consumes the SDK, it does not extend it —
so the `silo-docs-sync` workflow does not apply here. The one SDK dependency that
does not exist yet is RFC 0032's `ctx.storage.globalDir()` / `workspaceDir()`,
which is that RFC's deliverable and its docs obligation, not this one's.

The extension's own public surface is its **commands**, deliberately in place of
a published `TasksApi`:

| Command                  | Args             | Result                                                      |
| ------------------------ | ---------------- | ----------------------------------------------------------- |
| `silo.tasks.new`         | none             | reveals the panel and focuses quick-add                     |
| `silo.tasks.newInGlobal` | `title?: string` | the created task, or focuses quick-add on the global source |
| `silo.tasks.refresh`     | none             | reloads every resolved source                               |
| `silo.tasks.complete`    | `taskId: string` | the updated task                                            |

Commands that need a target fall back to a visible affordance rather than
silently doing nothing when invoked from a keybinding with no args — the
documented hazard on `Command.run`.

## Persistence

**Task data** — NDJSON, one `SiloTaskRecord` per line, trailing newline:

```
<globalDir()>/tasks.jsonl                     ctx.storage.globalDir()
<workspaceDir()>/tasks.jsonl                  ctx.storage.workspaceDir()
```

Both resolve under `~/.config/silo[-<identity>]/extension-storage/silo.tasks/`
(RFC 0032 / ADR 0022 tier 1) — user data the person can find, `grep`, back up,
and point an agent at, which is the entire reason it is a file.

Whole-file rewrite on every mutation. At the scale this stores — a personal task
list, hundreds to low thousands of lines, tens of KB — that is cheaper and far
simpler than incremental patching, and it is what makes the atomic-rename
guarantee possible. If a list ever grows past that, the fix is a different
storage strategy, not an incremental writer bolted onto this one.

`v: 1` on every record. A record with a higher `v` than the code understands is
routed to `unparsed` — preserved, not applied — so an older Silo cannot corrupt
a newer file.

**Preferences** — key/value, not files:

| Key            | Scope                    | Value                        |
| -------------- | ------------------------ | ---------------------------- |
| `view`         | `SidePanelProps.storage` | `ViewPrefs` (per workspace)  |
| `openTaskId`   | `SidePanelProps.storage` | last drill-in, per workspace |
| `newTasksGoTo` | `ctx.storage.workspace`  | `"workspace" \| "global"`    |

Panel prefs are read only after `SidePanelProps.hydrated` flips, per the SDK's
documented hydration behavior.

**No cache of task lists.** RFC 0031 calls for persisting last-known lists for
instant paint; that is a phase-2 need, when a source costs a subprocess round
trip. Reading a local `.jsonl` is sub-millisecond, and a cache here would be a
second source of truth for no gain.

**No migration** — nothing exists on disk today.

## Error handling

| Failure                                        | Behaviour                                                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `tasks.jsonl` absent                           | Treated as an empty list. Not an error; the file is created on first write.                                                         |
| A line fails to parse or validate              | Kept in `unparsed`, re-emitted on write. Surrounding lines load normally.                                                           |
| One or more unparsed lines present             | One non-blocking `ctx.ui.notify("warn", …)` naming the file and the line count, once per load.                                      |
| `readText` fails (permissions, I/O)            | That source enters an `error` state; the panel shows an `EmptyState` with the message and a retry, and other sources keep working.  |
| `writeText` / `rename` fails                   | The mutation rejects, an error toast fires, and the in-memory list is reloaded from disk so the UI matches reality (R10).           |
| `workspaceDir()` rejects (no workspace open)   | Expected: no workspace source is resolved. Not surfaced as an error.                                                                |
| `globalDir()` rejects                          | Fatal for the extension: log to `ctx.log`, notify once, render an `EmptyState`. There is no usable state without the global source. |
| A watch event arrives for our own write        | Ignored via the self-write window.                                                                                                  |
| A task id in a command argument does not exist | The command rejects with a message naming the id; no partial mutation.                                                              |
| An unknown `DetailSection.kind`                | Skipped silently. A newer provider degrades to a missing section, never a crash.                                                    |
| `parentId` points at a missing task            | Rendered as a plain id in detail; no orphan handling in phase 1 (nesting is not a phase-1 surface).                                 |

## Testing strategy

Co-located Vitest in the extension package (`npx vitest run`), pure-logic style
per `.agents/skills/silo-testing/SKILL.md` — no `@testing-library/react`, logic
extracted out of components so it is testable without rendering.

| Suite                | Covers                                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jsonl.test.ts`      | Round trip; blank/trailing lines; a corrupt line preserved verbatim at its index; a record with `v: 2` routed to `unparsed`; unknown keys survive a round trip; empty input.                                          |
| `record.test.ts`     | `toTask` field-by-field; `statusLabel` per lane; `toDetailSections` emits description/created/due/criteria and **only** through descriptors; a record with no optional fields produces no empty sections.             |
| `view.test.ts`       | Each `groupBy`; each `sortBy`; sort stability; `showDone`; label filter; query over title, labels, and exact id; empty input; every group empty after filtering.                                                      |
| `ids.test.ts`        | Uniqueness across a large batch; rank midpoint generation orders lexicographically between neighbours.                                                                                                                |
| `file-store.test.ts` | Absent file → empty; atomic write path (`.tmp` then `rename`, in that order); mutation serialization under concurrent calls; self-write suppression; write failure leaves in-memory state reloaded.                   |
| `provider.test.ts`   | `SiloTaskProvider` satisfies `TaskProvider`; create/update/setLane/delete each land in the file; `detail` for a missing id rejects.                                                                                   |
| `source-set.test.ts` | Global-only with no workspace; workspace resolution on `activeId`; re-resolve on workspace change disposes the old watch; identical locators dedupe to one source; frozen state identity changes only on real change. |
| `prefs.test.ts`      | Defaults; round trip; ignored before `hydrated`; `newTasksGoTo` falls back to global when the workspace source is absent.                                                                                             |
| `commands.test.ts`   | Each command's arg handling, including the no-args keybinding path and an unknown task id.                                                                                                                            |

`FileService` is faked with an in-memory map at the `ctx.files` seam, so no test
touches a real disk. A small `makeCtx()` helper builds a minimal fake
`ExtensionContext` (files, storage, workspaces, ui, log) shared across suites.

The boundary assertion in R5 — `providerId ===` absent from `src/ui` — is a
grep-based test in `boundaries.test.ts`, cheap and self-explaining when it fails.

## Constraints and existing decisions

- **[RFC 0032](../0032-ctx-extension-storage-directory/proposal.md)** — hard
  dependency. `ctx.storage.globalDir()` / `workspaceDir()` and the `ctx.files`
  sandbox lift for own directories are what allow `permissions: []`. Nothing here
  can be built against the published SDK until 0032 ships and the SDK is
  released.
- **[ADR 0022](../../decisions/0022-on-disk-storage-layout.md)** — three-tier
  on-disk layout. Task data is tier 1 (user data), reached only via 0032's
  directories; this extension never builds a path of its own under `$HOME`.
- **[RFC 0006](../0006-extension-permissions-sandbox.md)** — permissions. Phase 1
  declares none. `process` arrives with Beads in phase 2.
- **[ADR 0026](../../decisions/0026-sdk-component-set.md)** — the design-system
  kit is the source for content components; panel chrome stays bespoke where the
  side-panel doc says so (26×26 toolbar hits, not kit `Button size="sm"`).
- **[ADR 0017](../../decisions/0017-css-theming-contract.md)** — extension CSS may
  use **design tokens only**; no component or internal tokens, no hard-coded
  colors, fonts, or px sizes. Enforced by `silo/extension-design-tokens-only`.
- **[`docs/side-panel-design.md`](../../side-panel-design.md)** — panel
  typography, toolbar chrome, `.silo-scroll`, and the drill-in Back contract.
  Iterate its working log with anything this build forces.
- **[ADR 0038](../../decisions/0038-navigator-view-list.md)** — `Group by` is a
  toolbar control, not a second view. Phase 1 honours the rule in the panel;
  phase 2 inherits it in the Navigator.
- **[`apps/docs/guide/extension-checklist.md`](../../../apps/docs/guide/extension-checklist.md)**
  — the pre-flight checklist every extension runs before it is called done.
- **Platform ban** — no `@tauri-apps/*`, no `node:*`. Path work uses the SDK's
  `path` helper, not `node:path`.
- **Published-SDK lag** — `silo-extensions` builds against npm's
  `@silo-code/sdk`, not this workspace. `silo.engine` and the devDependency get
  pinned to the release carrying RFC 0032.
- **POSIX assumption** — the atomic `rename`-over-existing guarantee is POSIX;
  it matches `resolve-path.ts`'s existing POSIX-only stance. Revisit with
  Windows support, not before.
