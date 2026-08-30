# Design — 0032. A per-extension storage directory on `ctx`

How the requirements are satisfied. Working artifact — removed when the proposal
collapses.

## Architecture

Four layers, in dependency order:

| Package / crate              | Change                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `silo` (Rust)                | `start_watch` takes a `filter_noise` flag so the project-tree skip list doesn't apply inside extension storage (R8).                               |
| `@silo-code/sdk`             | `ExtensionStorageScopes` gains `globalDir()` / `workspaceDir()`; new `NoWorkspaceError`.                                                           |
| `@silo-code/extension-host`  | New `extension-storage-dirs.ts`; `PathScope.ownDirs`; startup root resolution; id-migration hook; extension-manager uninstall option + data probe. |
| `@silo-code/extensions-core` | `core.extensions` uninstall confirm grows the opt-in delete checkbox, built on public `ctx.ui.showModal`.                                          |

Nothing else in the host learns about the directories: the whole enforcement
story rides the one existing chokepoint, `security/resolve-path.ts`.

## Components

### `extension-host/extension-storage-dirs.ts` (new)

The single owner of the on-disk layout. Everything about "where does an
extension's data live" is here, and nothing else builds these paths.

```ts
/** Resolve `<configRoot>/extension-storage` and cache it. Called at startup. */
function initStorageRoot(): Promise<string>;
/** The paths this extension may currently touch. Empty only before init. */
function ownDirPaths(
  extensionId: string,
  workspaceId: string | undefined,
): readonly string[];
/** Create-on-first-call; the bodies behind `globalDir()` / `workspaceDir()`. */
function ensureGlobalDir(extensionId: string): Promise<string>;
function ensureWorkspaceDir(
  extensionId: string,
  workspaceId: string,
): Promise<string>;
/** For the uninstall confirm: file count + total bytes, or `null` if absent/empty. */
function extensionDataInfo(
  extensionId: string,
): Promise<{ path: string; files: number; bytes: number } | null>;
/** Recursive removal, used on opt-in delete and on empty-dir cleanup. */
function deleteExtensionData(extensionId: string): Promise<void>;
/** Rename a storage dir when an extension id is superseded (R7). */
function renameExtensionData(oldId: string, newId: string): Promise<void>;
/** True if `path` is inside the storage root — the watcher's filter decision. */
function isStoragePath(path: string): boolean;
```

Deliberately no exported `globalDirPath` / `workspaceDirPath`: `ownDirPaths` is
the only sync path consumer, and the `ensure*` functions compute their own.

The root is `${await userConfigDir()}/extension-storage` (ADR 0022 tier 1).
`userConfigDir()` already caches and is already awaited at startup
(`apps/desktop/src/main.tsx`, before `hydrate`), so `initStorageRoot` adds one
string concat to a promise that is already on the critical path.

Extension ids are already validated at install (`parseManifest`:
`/^[A-Za-z0-9][A-Za-z0-9._-]*$/`, no slashes, can't be `.`/`..`), so they are
safe path segments. Bundled ids (`silo.*`, `core.*`) are the same shape.
Workspace ids are host-generated. The module still refuses to build a path from
an id that fails the charset test — defence in depth, not a second validation
surface.

### Startup ordering, not a hoped-for invariant

`resolvePath` is synchronous and must decide against the own dirs, while the
directories are created asynchronously. An earlier draft argued this was safe
because a path can only be obtained by awaiting `globalDir()`. That is wrong: an
extension can cache its absolute path in `ctx.storage.global` in one session and
use it at the top of `activate()` in the next, never calling `globalDir()` at
all — and then `ownDirs` would be empty and the write would be denied.

So the root is resolved **eagerly, before any extension activates**:

```
main.tsx:  userConfigDir() → initStorageRoot() → hydrate() → activateExtensions()
```

`ownDirPaths` is then pure string work and never empty in practice. If
`initStorageRoot` rejects, the root stays unset, own-dir paths fall through to
the normal deny path, and the failure is logged to the Output panel with its
cause (R5) — a loud, explained failure rather than a mysterious
`PathDeniedError`.

### `security/resolve-path.ts`

`PathScope` gains one member; `resolvePath` gains one check:

```ts
export interface PathScope {
  readonly roots: readonly string[];
  /** This extension's own storage directories — always allowed, read or write. */
  readonly ownDirs: readonly string[];
  readonly trusted: boolean;
  readonly permissions: ReadonlySet<Permission>;
}
```

In `resolvePath`, after `toAbsolute` and before the `withinRoots(roots)` check:

```ts
if (withinRoots(scope.ownDirs, abs)) return abs;
```

`withinRoots` already does exactly the right containment test (normalized
prefix, `path === root || path.startsWith(root + "/")`), so a sibling like
`…/silo.tasks/global-evil` and a `..` escape both fall through to the normal
rules. Reusing it rather than writing a second matcher is the point.

`ownDirs` is **required**, not optional, so the compiler lists every
construction site to update: `context.ts`, `resolve-path.test.ts`,
`scoped-services.test.ts`, and any scope built by the automation bridge.

Two knock-on details:

- **Relative paths are unchanged.** They still resolve against `roots[0]`, the
  workspace. An extension addresses its own directory with the absolute path the
  host handed it. Documented explicitly, because it is the one surprising part.
- **`toAbsolute` returning `null`** ("no workspace open") must not pre-empt the
  own-dir check — an extension with no workspace open still gets its global
  directory. An absolute own-dir path never hits that branch, so the ordering
  above is sufficient; the test suite pins it.

### `extension-host/context.ts`

`scope` gains a live getter so the workspace dir tracks the active workspace the
same way `roots` does:

```ts
const scope: PathScope = {
  get roots() { … },
  get ownDirs() {
    return ownDirPaths(extensionId, getActiveWorkspace()?.id);
  },
  trusted: options.trusted ?? false,
  permissions,
};
```

and `ctx.storage` gains the two methods, closing over `extensionId`:

```ts
storage: {
  global: globalStorage,
  workspace: getWorkspaceExtensionStorage(extensionId),
  globalDir: () => ensureGlobalDir(extensionId),
  workspaceDir: () => {
    const ws = getActiveWorkspace();
    if (!ws) return Promise.reject(new NoWorkspaceError());
    return ensureWorkspaceDir(extensionId, ws.id);
  },
},
```

### Workspace keying

The per-workspace directory is named by the workspace **id**, so it follows the
workspace, not the folder: delete a workspace and re-add the same project and
the extension sees a new, empty directory.

That is the same rule `ctx.storage.workspace` already follows — the key/value
bag lives in the workspace file and dies with it — and one rule across both
scopes beats two. RFC 0031's objection to workspace ids was about writing them
into task **data** that may be shared or committed; a host-owned path on the
user's own disk is not that. The behaviour is documented in `workspaceDir()`'s
TSDoc rather than engineered around: keying by folder path would break on a
move/rename and would make two workspaces over one folder share data.

### `extension-host/extension-manager.ts`

- `uninstall(id, opts?: { deleteData?: boolean })` — the existing body, plus
  data handling **after** the extension is unloaded and its folder removed:
  delete when `opts.deleteData`, and also delete unconditionally when the
  directory holds no files (R6 — nothing to lose, no reason to litter). A
  failure there is surfaced but does not roll back the uninstall.
- `getDataInfo(id)` — a thin pass-through to `extensionDataInfo`, so the UI
  never touches path building.
- When data is retained, log its absolute path to the Output panel
  (`silo:extension-host`), the only pointer a user gets afterwards.

Both are host-internal (`@silo-code/extension-host/internal`); neither reaches
`@silo-code/sdk`.

### Id migration (R7)

`loadInstalled` already retires a superseded on-disk install and
`migrateGlobalExtensionState` already moves its key/value bag, behind a toast
that promises _"Your settings were kept."_ `renameExtensionData(oldId, newId)`
joins that same pass so files keep the promise too. It is a directory rename,
idempotent, and refuses to clobber an existing `<newId>` directory (logging the
conflict and leaving both in place) — a rename is not worth losing data over.

### `extensions-core/src/extensions` — the uninstall dialog

`ctx.ui.confirm` has no room for a checkbox, but `ctx.ui.showModal<T>` is
**public SDK** (`packages/sdk/src/ui-service.ts`) and returns a caller-chosen
value — exactly the shape needed. So the dialog is an ordinary extension-side
component, `UninstallDialog.tsx`, using `showModal` for the chrome and
`CheckboxRow` + `ModalActions` from `@silo-code/sdk` for the content (ADR 0026 —
the kit owns modal _content_). No host-internal modal import, and third-party
extensions can copy the pattern verbatim.

Flow: `getDataInfo(id)` → if `null`, keep today's plain `ctx.ui.confirm`; if
non-null, `showModal` with the checkbox and a formatted "3 files, 1.2 MB", then
`uninstall(id, { deleteData: checked })`.

Extracted pure helpers (so the logic is testable without rendering, per
`silo-testing`): `formatDataSummary({ files, bytes })` → `"3 files, 1.2 MB"`,
and the outcome mapping `("uninstall" | "cancel", checked) → { uninstall, deleteData }`
mirroring `resolveDialogOutcome`.

### The watcher's noise filter (R8)

`start_watch` (`src-tauri/src/commands/watch.rs`) drops every event whose path
contains `/node_modules/`, `/target/`, `/dist/`, `/build/`, `/.next/`, or
`/.cache/`. That is right for a project tree and wrong for a small host-owned
storage directory whose subdirectory names the extension chooses — an extension
storing files under `cache/` would get a watcher that silently never fires.

The command takes a `filter_noise: bool`; `should_skip` is consulted only when
it is true. The host decides: `getFileService().watch` passes
`!isStoragePath(path)`. The public `ctx.files.watch` signature is unchanged, and
workspace watching keeps today's behaviour exactly.

### `@silo-code/sdk`

`ExtensionStorageScopes` grows the two methods with `@public` TSDoc covering
(a) create-on-first-call, (b) no `fs:*` permission needed _inside_ these paths,
(c) that relative paths still resolve against the workspace, (d) the
workspace-identity keying, and (e) `NoWorkspaceError`.

`NoWorkspaceError` is a new `@public` error class alongside `PathDeniedError`,
with the same `Object.setPrototypeOf` treatment so `instanceof` survives the
down-levelled build and the host↔extension boundary. It exists so an extension
can tell "no workspace is open" from "the disk is full" — a plain `Error` forces
message-sniffing, and a `null` return invites silently skipping persistence.

## Data flow

First write by `silo.tasks` (declares `process` only):

```
startup:  userConfigDir() → initStorageRoot() → hydrate → activateExtensions
activate(ctx)
  └─ await ctx.storage.globalDir()
       └─ fsCreateDir(<root>/extension-storage/silo.tasks/global)
       └─ "/Users/…/.config/silo/extension-storage/silo.tasks/global"
  └─ ctx.files.writeText(`${dir}/tasks/global.jsonl`, …)
       └─ scopeFileService → resolvePath(scope, path, "write")
            ├─ trusted? no
            ├─ toAbsolute → absolute already
            ├─ withinRoots(scope.ownDirs, abs) → true  ← the lift
            └─ returns abs; host fs command runs
```

Uninstall with data present:

```
ExtensionsPage.uninstall(ext)
  └─ mgr.getDataInfo(id) → { files: 3, bytes: 1_258_291 }
  └─ ctx.ui.showModal(UninstallDialog) → { uninstall: true, deleteData: false }
  └─ mgr.uninstall(id, { deleteData: false })
       ├─ unloadExtension / delete <configRoot>/extensions/<id>
       ├─ drop the installed.json record
       └─ log the retained path to Output; data left on disk
```

## Persistence

New on-disk tree, ADR 0022 tier 1, identity-keyed with everything else beneath
`userConfigDir()`:

```
~/.config/silo[-dev]/extension-storage/<extensionId>/
├── global/            ← ctx.storage.globalDir()
└── workspaces/<wsId>/ ← ctx.storage.workspaceDir()
```

The `global/` + `workspaces/` split (rather than putting global content at
`<extensionId>/` directly) exists so `workspaces` is never a name an extension
could collide with inside its own global directory — no reserved names, no
documented caveat.

No migration for existing data: nothing writes here today. The one migration
that exists is the id rename in R7. No schema — the contents are entirely the
extension's business. Nothing about this tree is read at startup beyond
resolving its root path.

## Error handling

| Failure                                       | Behaviour                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `workspaceDir()` with no workspace open       | Rejects with `NoWorkspaceError` — not `PathDeniedError`; nothing was denied.                                 |
| `initStorageRoot` fails at startup            | Own-dir paths deny as out-of-workspace; the cause is logged to Output (`silo:extension-host`). Never silent. |
| `mkdir` fails (permissions, full disk)        | The rejection propagates from `globalDir()`/`workspaceDir()`; the extension handles it like any I/O failure. |
| Path outside the own dirs and unpermitted     | Unchanged: `PathDeniedError`, same message as today.                                                         |
| `getDataInfo` walk fails or hits its cap      | Treated as "data present, size unknown" → checkbox shown without a count. Never blocks an uninstall.         |
| `deleteExtensionData` fails                   | Uninstall still completes; the error is surfaced via `ctx.ui.notify("error", …)` and logged to Output.       |
| `renameExtensionData` finds `<newId>` present | Leaves both directories, logs the conflict; the migration's other steps still run.                           |

## Testing strategy

Co-located Vitest, pure-logic style (`.agents/skills/silo-testing`):

- `security/resolve-path.test.ts` — own-dir allow (read + write), sibling-prefix
  denial, `..`-escape denial, another extension's dir denied, no-workspace-open
  with an own-dir path allowed, `fs:read`/`fs:write` behaviour unchanged, trusted
  pass-through unchanged.
- `extension-storage-dirs.test.ts` — path shapes, id namespacing, identity-keyed
  root, lazy creation (no `mkdir` until asked), `ownDirPaths` populated after
  init and empty before it, `extensionDataInfo` counting / `null`-when-empty /
  cap behaviour, `renameExtensionData` including the idempotent and
  conflict cases, `isStoragePath`, invalid-id refusal.
- `context.test.ts` — the two `ctx.storage` methods exist, are per-extension,
  track the active workspace, and reject with `NoWorkspaceError`.
- A startup-ordering test — an own-dir path accepted at the top of `activate()`
  with no preceding `globalDir()` call (R5).
- `extension-manager.test.ts` — `uninstall` with and without `deleteData`;
  empty-dir removal; retained-path logging; data-delete failure does not fail
  the uninstall.
- `extension-id-migration.test.ts` — storage rename alongside the kv migration.
- Watch filtering — `should_skip` is only consulted when `filter_noise` is set
  (Rust unit test), and the host passes `false` for storage paths (TS test).
- `UninstallDialog` helpers — `formatDataSummary` (singular/plural, B/KB/MB) and
  the outcome mapping.

The fs is faked at the existing seam these suites already use (the `tauri-fs`
wrappers), so no TS test touches a real disk.

## Constraints and existing decisions

- **[ADR 0022](../../decisions/0022-on-disk-storage-layout.md)** — three-tier
  on-disk layout. This is tier 1 (user data), identity-keyed, under
  `userConfigDir()`.
- **[ADR 0015](../../decisions/0015-phased-security-model.md)** — phased security
  model. This widens phase 2's path-scoping, not the trust model; the own dir is
  honest-mistake containment, never a sandbox claim.
- **[RFC 0006](../0006-extension-permissions-sandbox.md)** — permissions/consent.
  No new `Permission` value; the consent prompt shrinks for the Tasks case
  because two declarations disappear.
- **[RFC 0004](../0004-ctx-storage.md)** — `ctx.storage`. These methods sit on
  the same object and use the same "one namespace per extension id" rule.
- **[ADR 0026](../../decisions/0026-sdk-component-set.md)** — modal _content_
  comes from the SDK kit; the modal shell stays host chrome (`showModal`).
- **[ADR 0019](../../decisions/0019-runtime-extension-loading.md)** — install /
  uninstall lifecycle, which the delete option and the id migration hang off.
- **Boundaries** — extensions reach this only through `ctx`; the host module is
  internal. `state/` stays a leaf, so nothing about directories goes into
  `state/workspaces.ts` (this is why workspace deletion doesn't touch the
  filesystem — it couldn't, without breaking the layering).
- **Pre-existing: case-colliding ids.** On a case-insensitive filesystem
  `Silo.Tasks` and `silo.tasks` share one storage directory — exactly as they
  already share one `extensions/<id>` code directory today. Storage inherits the
  behaviour; the fix belongs at install time, separately. Notably the storage id
  segment is **not** lowercased, so both directories keep following one rule.
- **POSIX-only** — `resolve-path.ts` treats paths as POSIX; unchanged here.
