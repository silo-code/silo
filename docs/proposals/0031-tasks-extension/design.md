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
    │       ├── jsonl.ts         pure parse/serialize, unparsed-line preservation
    │       ├── record.ts        SiloTaskRecord (v: 1), record ⇄ Task, patch application
    │       ├── file-store.ts    one source's file: load, CAS mutate, atomic write, watch
    │       └── provider.ts      SiloTaskProvider (implements TaskProvider)
    ├── sources/
    │   └── source-set.ts        resolves + owns the live sources; the reactive store
    ├── lib/
    │   ├── ids.ts               task id + append-order rank generation
    │   ├── view.ts              pure group / filter / sort / search over Task[]
    │   └── prefs.ts             panel view prefs, in ctx.storage.global
    └── ui/
        ├── TasksPanel.tsx       root: list page or detail page
        ├── TasksToolbar.tsx     actions row + SearchInput
        ├── TaskList.tsx         groups + rows
        ├── TaskRow.tsx          glyph · title · priority
        ├── TaskDetail.tsx       drill-in page
        ├── DetailSections.tsx   generic descriptor renderer
        ├── QuickAdd.tsx         bottom-docked title input + Add button
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
  /** Ordering key within the source; lexicographically sortable. Append-order in phase 1. */
  readonly rank: string;
  readonly parentId: string | null;
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
  readonly updatedAt: number;
}
```

`priority` is in core (see the proposal's corrections) because the list sorts by
it and every row renders it. `rank` is a string so a task can one day be inserted
between two neighbours without renumbering the file, but phase 1 has no
reordering surface and so simply **appends** — a zero-padded counter, ordered
lexicographically. The insert-between generator is written when phase 2's table
has a caller for it; building it now would ship an untested code path and a test
for a feature nobody can reach.

`parentId` and `assignees` are likewise carried and round-tripped but rendered
nowhere in phase 1. They are in core because the RFC fixes one schema across
every provider, not because this phase uses them — stated explicitly so a reader
doesn't go looking for the nesting UI.

`TaskDraft` is what `createTask` accepts (`title` required, everything else
optional). `TaskPatch` names **only** core fields, plus one bag:

```ts
export interface TaskPatch {
  title?: string;
  lane?: TaskLane;
  priority?: TaskPriority;
  labels?: readonly string[];
  /** Edits to provider-specific fields, keyed by `DetailSection.key`. */
  providerFields?: Readonly<Record<string, unknown>>;
}
```

The earlier sketch had `TaskPatch` carry Silo's own non-core fields directly,
"which the provider knows how to apply and other providers would ignore." That
puts provider-specific keys on the one type the whole seam shares — exactly the
coupling R5 bans, relocated from a runtime `if` into the type system. Non-core
edits instead ride the same descriptor channel that surfaced them, in reverse:
the provider hands the UI a section with a `key`, and an edit to that section
comes back as `providerFields[key]`. The core learns a set of opaque strings and
nothing about what they mean; a provider ignores keys it doesn't recognize.

### `model/detail.ts` — the descriptor channel

```ts
/** Present when the section is round-trippable; the patch key it edits into. */
interface Editable {
  key?: string;
  editable?: boolean;
}

export type DetailSection =
  | ({ kind: "text"; label?: string; value: string } & Editable)
  | ({ kind: "field"; label: string; value: string } & Editable)
  | ({
      kind: "checklist";
      label: string;
      items: readonly { text: string; done: boolean }[];
    } & Editable);
```

Plain data, no React, no functions — serializable and directly assertable in a
test. `taskLinks` (Beads' dependency sections) is deliberately **not** added
here: a union member is additive and non-breaking, and phase 1 has no producer
for it. Three kinds with three different shapes is already enough to prove the
renderer is generic.

`key` + `editable` is what makes the channel bidirectional. `DetailSections.tsx`
renders a read-only section for a descriptor without them, and an editor
appropriate to the `kind` for one with them — `Textarea` for `text`, an input for
`field`, `CheckboxRow` + `AddRow` for `checklist` — emitting
`{ providerFields: { [key]: next } }`. The Silo provider tags its description
(`key: "description"`), due date (`"dueDate"`), and acceptance criteria
(`"acceptanceCriteria"`); its created date carries no `key` and is therefore
read-only. No component knows what any of those strings mean.

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
createFileStore(files: FileService, dir: string, name: string): {
  load(): Promise<ParsedFile>;
  /** Re-applied against a fresh load if the file changed underneath (CAS). */
  mutate(fn: (records: SiloTaskRecord[]) => void): Promise<ParsedFile>;
  watch(onExternalChange: () => void): Disposable;
}
```

- **Read**: `stat` → absent means empty; present means `readText` + `parseJsonl`.
  The `FileMeta` (size + mtime) is kept alongside the parse as the file's
  **version**.
- **Write**: `writeText` to a dotted sibling `.tasks.jsonl.tmp`, then `rename`
  over `tasks.jsonl`. The dot keeps a transient file out of a directory the RFC
  advertises as user-browsable, and a `.tmp` left by a crash is overwritten by
  the next write rather than accumulating.
- **Compare-and-swap**: immediately before the rename, `stat` again. If size or
  mtime differs from the version the mutation loaded, the write is abandoned,
  the file is reloaded, and the mutation function is re-applied to the fresh
  records — up to a small retry bound, after which it rejects and leaves the
  file untouched. This is what reconciles the two halves of the storage pitch:
  the file is advertised as agent-writable, and a whole-file rewrite would
  otherwise silently swallow an append that landed mid-mutation. It is not
  airtight — a write landing inside the final stat→rename gap is still lost —
  and that residual is documented in the README rather than papered over. A
  lock file would close it and is not worth its failure modes here.
- **Serialize**: mutations queue on a single in-flight promise chain per store,
  so two rapid edits from within Silo can't interleave read-modify-write. CAS
  covers writers the queue can't see.
- **Watch**: on the source's **directory**, never on `tasks.jsonl` — the rename
  replaces the file, so a file-level watch would go deaf after the first
  mutation. Events are filtered to the `tasks.jsonl` basename, which also drops
  the store's own `.tmp` churn. RFC 0032 R8 disables the host's project-tree
  noise filter inside extension storage, so the watch fires there predictably.
- **Self-write suppression** is **content-based**, not a timing window: the
  store keeps the exact bytes it last wrote and drops a reload whose bytes match
  them. A timing window would make R11's "no reload loop" a race, and would make
  its test depend on the clock. Content comparison is deterministic and its test
  is a plain assertion.

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

`globalDir()` is resolved once during `activate` and cached; `workspaceDir()` is
re-resolved on every workspace change, because the SDK documents that its path
changes with the active workspace and must not be cached across a switch. With
no workspace open it rejects with **`NoWorkspaceError`** specifically — that one
rejection maps to "no workspace source" and is not an error surface. Any other
rejection is a real failure and is treated as one; catching broadly here would
hide a genuine storage fault behind an empty panel.

### `lib/view.ts` — pure list transformation

```ts
export interface ViewPrefs {
  /** Defaults to "source" in the panel — see below. */
  groupBy: "none" | "status" | "source" | "label";
  sortBy: "rank" | "updated" | "priority" | "title";
  /** Multi-select over lanes. Defaults to every lane except "done". */
  laneFilter: readonly TaskLane[];
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

`laneFilter` replaces the earlier `showDone` boolean: R8 asks for lane filtering
and a done toggle, and one multi-select over lanes is both, with no second rule
about how the two interact.

**The panel's default `groupBy` is `"source"`,** not `"none"`. R7 forbids a
per-row provider badge and leans on grouping to tell sources apart, so a `"none"`
default would render the always-present global list and the workspace list as one
undifferentiated stream on first run — the one configuration a new user actually
sees. `buildView` collapses a single non-empty group to the same unnamed shape
`"none"` produces, so with no workspace open the panel still reads as a flat
list and the two defaults are indistinguishable until there's something to
separate. There is no source-visibility toggle in phase 1; hiding a source is a
phase-2 concern that arrives with detected third-party providers.

`groupBy: "label"` puts a multi-label task in **every** matching group and
collects the unlabeled into a trailing "No label" group — so a task can legitimately
appear more than once under that one grouping, which the tests assert rather than
guard against.

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
`CheckboxRow` (acceptance criteria), `AddRow` (quick add, criteria), `Tooltip`.

**Three editable fields have no kit component**, and the resolution is to avoid
inventing widgets rather than to hand-roll three:

| Field     | Phase-1 editor                                                                  |
| --------- | ------------------------------------------------------------------------------- |
| Labels    | Kit `Input` holding a comma-separated list; trimmed and de-duplicated on commit |
| Due date  | Native `<input type="date">`, styled with design tokens                         |
| Assignees | **Not editable** — cut from phase 1 (see R3/R10)                                |

A chips/tags input, a multi-select, and a date picker are all things the kit
should own if Silo wants them; growing them inside one extension would fork the
design system, which is precisely what ADR 0026 exists to prevent. The comma
list is the simplest thing that fully meets R10, and the native date input is
not "hand-rolling something the kit covers" — the kit covers nothing here. The
date input is the first panel control with no kit component behind it, so its
token styling goes in the `docs/side-panel-design.md` working log.

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
QuickAdd submit(title)   (bottom-docked; Add button enables when non-empty)
 └─ sourceSet.createTask(activeWorkspaceSource ?? globalSource, { title })
      └─ provider.createTask(source, draft)
           └─ fileStore.mutate(records => records.push(newRecord()))
                ├─ load + parse (fresh — never a stale in-memory copy), keep stat
                ├─ writeText(`${dir}/.tasks.jsonl.tmp`)
                ├─ re-stat tasks.jsonl — changed? → reload, re-apply, retry
                ├─ rename(tmp, tasks.jsonl)
                └─ remember the exact bytes written
      └─ sourceSet re-derives Task[] and notifies → panel re-renders
```

**An agent appends a line to `tasks.jsonl`**

```
ctx.files.watch(<source dir>) → change event   (directory, not the file —
 │                                              rename replaces the inode)
 ├─ basename !== "tasks.jsonl"? → ignore (drops our own .tmp churn)
 └─ debounce 150ms → fileStore.load()
      ├─ bytes identical to what we last wrote? → ignore (no reload loop)
      └─ else notify → panel re-renders
```

## APIs / interfaces

**No `@silo-code/sdk` change.** Phase 1 consumes the SDK, it does not extend it —
so the `silo-docs-sync` workflow does not apply here. The one SDK dependency that
does not exist yet is RFC 0032's `ctx.storage.globalDir()` / `workspaceDir()`,
which is that RFC's deliverable and its docs obligation, not this one's.

The extension's own public surface is its **commands**, deliberately in place of
a published `TasksApi`:

| Command                  | Args              | With the arg                        | Without it                                               |
| ------------------------ | ----------------- | ----------------------------------- | -------------------------------------------------------- |
| `silo.tasks.new`         | `title?: string`  | creates → `Task`                    | reveals the panel, focuses quick-add → `undefined`       |
| `silo.tasks.newInGlobal` | `title?: string`  | creates in the global list → `Task` | reveals the panel, focuses quick-add → `undefined`       |
| `silo.tasks.refresh`     | none              | —                                   | reloads every resolved source                            |
| `silo.tasks.complete`    | `taskId?: string` | completes it → `Task`               | completes the drilled-into task; else reveals + notifies |

Commands that need a target fall back to a visible affordance rather than
silently doing nothing when invoked from a keybinding with no args — the
documented hazard on `Command.run`. The two return shapes on the create commands
are part of the contract, not an accident: a caller passing a title gets the task
back, a keybinding gets a focused input.

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

| Key                  | Scope                | Value                     |
| -------------------- | -------------------- | ------------------------- |
| `view:<workspaceId>` | `ctx.storage.global` | `ViewPrefs`               |
| `view:global`        | `ctx.storage.global` | `ViewPrefs`, no workspace |

**Not `SidePanelProps.storage`, and not `ctx.storage.workspace`.** Those are the
same per-workspace bag (`extension-storage.ts`), captured into and restored from
the **workspace record** (`state/panel-state.ts`; ADR 0035 confirms
`extensionState` is always per-workspace and never global). With
`activeId === null` there is no record to save into, so every write is discarded
on the next switch — and R2 requires the no-workspace case to be a first-class
one, since the global list is the always-present product surface. Keying a
global-scope bag by workspace id preserves per-workspace variance and adds a
`"global"` key for the no-workspace case, which the panel-scoped bag simply
cannot express.

Prefs are read only after the storage reports hydration and re-read when it
flips, per the SDK's documented hydration behavior.

**The open task is not persisted.** The earlier sketch stored `openTaskId`;
restoring into a detail page for a task the user has since forgotten is worse
than landing on the list, and it makes the panel's first paint depend on a task
id that may no longer exist.

**No cache of task lists.** RFC 0031 calls for persisting last-known lists for
instant paint; that is a phase-2 need, when a source costs a subprocess round
trip. Reading a local `.jsonl` is sub-millisecond, and a cache here would be a
second source of truth for no gain.

**No migration** — nothing exists on disk today.

## Error handling

| Failure                                          | Behaviour                                                                                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks.jsonl` absent                             | Treated as an empty list. Not an error; the file is created on first write.                                                                                                                                |
| A line fails to parse or validate                | Kept in `unparsed`, re-emitted on write. Surrounding lines load normally.                                                                                                                                  |
| One or more unparsed lines present               | One non-blocking `ctx.ui.notify("warn", …)` naming the file and the line count. Suppressed while the unparsed set is unchanged, so a watched file the user is mid-repair doesn't toast on every keystroke. |
| A mutation's CAS check keeps failing             | Rejects after a small retry bound with a message naming the file; the file is left exactly as the other writer left it.                                                                                    |
| `readText` fails (permissions, I/O)              | That source enters an `error` state; the panel shows an `EmptyState` with the message and a retry, and other sources keep working.                                                                         |
| `writeText` / `rename` fails                     | The mutation rejects, an error toast fires, and the in-memory list is reloaded from disk so the UI matches reality (R10).                                                                                  |
| `workspaceDir()` rejects with `NoWorkspaceError` | Expected: no workspace source is resolved. Not surfaced as an error. Any _other_ rejection is a real failure and does surface.                                                                             |
| `globalDir()` rejects                            | Fatal for the extension: log to `ctx.log`, notify once, render an `EmptyState`. There is no usable state without the global source.                                                                        |
| A watch event arrives for our own write          | Reloaded bytes match what the store last wrote → dropped. Content comparison, never a timing window.                                                                                                       |
| A task id in a command argument does not exist   | The command rejects with a message naming the id; no partial mutation.                                                                                                                                     |
| An unknown `DetailSection.kind`                  | Skipped silently. A newer provider degrades to a missing section, never a crash.                                                                                                                           |
| A `providerFields` key the provider doesn't know | Ignored; the rest of the patch still applies. A newer UI cannot fail a write against an older provider.                                                                                                    |
| `parentId` is set                                | Not rendered at all in phase 1 — nesting is not a phase-1 surface, so there is no orphan case to handle.                                                                                                   |

## Testing strategy

Co-located Vitest in the extension package (`npx vitest run`), pure-logic style
per `.agents/skills/silo-testing/SKILL.md` — no `@testing-library/react`, logic
extracted out of components so it is testable without rendering.

| Suite                | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jsonl.test.ts`      | Round trip; blank/trailing lines; a corrupt line preserved verbatim at its index; a record with `v: 2` routed to `unparsed`; unknown keys survive a round trip; empty input.                                                                                                                                                                                                                                                                                      |
| `record.test.ts`     | `toTask` field-by-field; `statusLabel` per lane; `toDetailSections` emits description/created/due/criteria and **only** through descriptors; which sections carry a `key` and which are read-only; `applyPatch` maps `providerFields` and ignores unknown keys; a record with no optional fields produces no empty sections.                                                                                                                                      |
| `view.test.ts`       | Each `groupBy`; `label` grouping placing a multi-label task in several groups and an unlabeled one in "No label"; `source` grouping collapsing to one unnamed group when only one source is non-empty; each `sortBy`; sort stability; `laneFilter`, including the done-excluded default; label filter; query over title, labels, and exact id; empty input; every group empty after filtering.                                                                    |
| `ids.test.ts`        | Uniqueness across a large batch; append-order ranks sort lexicographically in creation order. No midpoint case — phase 1 ships no insert-between generator.                                                                                                                                                                                                                                                                                                       |
| `file-store.test.ts` | Absent file → empty; write path (`.tasks.jsonl.tmp` then `rename`, in that order); **CAS** — a file changed between load and rename triggers reload + re-apply and the external write survives; retry exhaustion rejects and leaves the file untouched; mutation serialization under concurrent calls; content-based self-write suppression; a directory event for a basename other than `tasks.jsonl` is ignored; write failure leaves in-memory state reloaded. |
| `provider.test.ts`   | `SiloTaskProvider` satisfies `TaskProvider`; create/update/setLane/delete each land in the file; a patch's `providerFields` reach the record; `detail` for a missing id rejects.                                                                                                                                                                                                                                                                                  |
| `source-set.test.ts` | Global-only with no workspace; workspace resolution on `activeId`; re-resolve on workspace change disposes the old watch; identical locators dedupe to one source; frozen state identity changes only on real change (the `useSyncExternalStore` contract — a no-op notification must not hand back a new object).                                                                                                                                                |
| `prefs.test.ts`      | Defaults, including `groupBy: "source"` in the panel; round trip; ignored before hydration and re-read when it flips; per-workspace keying; the `"global"` key used with no workspace open.                                                                                                                                                                                                                                                                       |
| `commands.test.ts`   | Each command's arg handling: create with and without a `title` and the two documented return shapes; `complete` by id, by drill-in, and with neither; an unknown task id.                                                                                                                                                                                                                                                                                         |

`FileService` is faked with an in-memory map at the `ctx.files` seam, so no test
touches a real disk. A small `makeCtx()` helper builds a minimal fake
`ExtensionContext` (files, storage, workspaces, ui, log) shared across suites.

The boundary assertion in R5 is a grep-based test in `boundaries.test.ts`, cheap
and self-explaining when it fails. It greps for the **bare token** `providerId`
under `src/ui`, not for `providerId ===`: the narrower pattern is trivially
defeated by `switch (source.providerId)`, by dropping the spaces, or by hoisting
`"silo"` into a constant, and a boundary test that can be sidestepped by
reformatting is theatre. `boundaries.test.ts` reads source from disk with
`node:fs` — the one file exempt from R13's platform ban, since it never reaches
`dist/`.

## Constraints and existing decisions

- **[RFC 0032](../0032-ctx-extension-storage-directory.md)** — hard
  dependency. `ctx.storage.globalDir()` / `workspaceDir()` and the `ctx.files`
  sandbox lift for own directories are what allow `permissions: []`. Nothing here
  can be built against the published SDK until 0032 ships and the SDK is
  released.
  RFC 0032 R8 also lifts the host's `node_modules` / `dist` / `build` watch
  filter inside `extension-storage/`, so R11's external-change watch behaves
  predictably there; the `tasks.jsonl` path contains none of those segments
  either way, so this is belt-and-braces rather than load-bearing.
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
  `@silo-code/sdk`, not this workspace. Two **different** numbers get pinned:
  `silo.engine` is a floor on the **host app** version (`engine-compat.ts`
  checks it against the running Silo — 0.58.x today), so it names the app
  release whose runtime carries RFC 0032; the `@silo-code/sdk` devDependency is
  the **npm package** version (0.41.x today), naming the release whose types do.
  `follow-ups` shows the shape: `engine: "^0.42.0"` alongside
  `@silo-code/sdk: "^0.33.0"`. Putting the SDK version in `silo.engine` would
  make the compatibility gate wrong in both directions.
- **Windows is a shipped target, and two assumptions here are unverified on
  it.** The earlier draft deferred this ("revisit with Windows support, not
  before"); that was wrong — `release.yml`, `release-nightly.yml`, and CI's
  `rust-windows` job all build it. (1) `fs_rename` is a bare `std::fs::rename`,
  which on Windows maps to `MoveFileEx` with replace-existing: it overwrites, so
  the strategy works, but it is not the POSIX atomicity guarantee and it fails
  outright on a sharing violation (an editor or antivirus holding the file). The
  CAS retry absorbs the transient case; a persistent one surfaces as a write
  error. (2) `resolve-path.ts` states in its own header that paths are treated
  as POSIX and "Windows scoping is future work", so `permissions: []` over an
  own-dir path is untested there. Both are verified before phase 1 is called
  done; if either fails it is filed against RFC 0032, not worked around here.
