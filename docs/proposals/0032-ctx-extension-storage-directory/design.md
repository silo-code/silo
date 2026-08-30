# Design — 0032. A per-extension storage directory on `ctx`

How the requirements are satisfied. Working artifact — removed when the proposal
collapses.

## Architecture

Three packages, in dependency order:

| Package                      | Change                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `@silo-code/sdk`             | `ExtensionStorageScopes` gains `globalDir()` / `workspaceDir()` + TSDoc.                                                       |
| `@silo-code/extension-host`  | New `extension-storage-dirs.ts`; `PathScope.ownDirs`; wiring in `context.ts`; extension-manager uninstall option + data probe. |
| `@silo-code/extensions-core` | `core.extensions` uninstall confirm grows the opt-in delete checkbox.                                                          |

Nothing else in the host learns about the directories: the whole enforcement
story rides the one existing chokepoint, `security/resolve-path.ts`.

## Components

### `extension-host/extension-storage-dirs.ts` (new)

The single owner of the on-disk layout. Everything about "where does an
extension's data live" is here, and nothing else builds these paths.

```ts
/** `<configRoot>/extension-storage` — resolved once, cached. */
function storageRoot(): Promise<string>;
/** Sync path computation, once the root is known; `null` before that. */
function globalDirPath(extensionId: string): string | null;
function workspaceDirPath(
  extensionId: string,
  workspaceId: string,
): string | null;
/** The two paths this extension may currently touch (`[]` before the root resolves). */
function ownDirPaths(
  extensionId: string,
  workspaceId: string | undefined,
): readonly string[];
/** Create-on-first-call; the public `globalDir()` / `workspaceDir()` bodies. */
function ensureGlobalDir(extensionId: string): Promise<string>;
function ensureWorkspaceDir(
  extensionId: string,
  workspaceId: string,
): Promise<string>;
/** For the uninstall confirm: file count + total bytes, or `null` if absent/empty. */
function extensionDataInfo(
  extensionId: string,
): Promise<{ path: string; files: number; bytes: number } | null>;
/** Recursive removal, used only when the user opts in. */
function deleteExtensionData(extensionId: string): Promise<void>;
```

The root is `${await userConfigDir()}/extension-storage` (ADR 0022 tier 1).
`userConfigDir()` already caches and is already resolved at startup
(`apps/desktop/src/main.tsx` awaits it before `hydrate`), so the extra cost is
one string concat plus a lazy `mkdir -p` per extension that actually asks.

Extension ids are already validated at install (`parseManifest`:
`/^[A-Za-z0-9][A-Za-z0-9._-]*$/`, no slashes, can't be `.`/`..`), so they are
safe path segments. Bundled ids (`silo.*`, `core.*`) are the same shape.
Workspace ids are host-generated. The module still refuses to build a path from
an id that fails the charset test — defence in depth, not a second validation
surface.

### The sync/async seam

`resolvePath` is synchronous and must decide against the own dirs. The
directories are created asynchronously. The invariant that makes this safe:

> An extension can only obtain an own-dir path by awaiting `globalDir()` /
> `workspaceDir()`, and those await the root. So by the time any own-dir path
> can be handed to `ctx.files`, the root — and therefore the sync path
> computation — is available.

`ownDirPaths` therefore returns `[]` while the root is unresolved rather than
blocking or throwing: at that moment no extension can hold a path to compare
against anyway.

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

In `resolvePath`, after `toAbsolute` and before the `withinRoots` check:

```ts
if (withinRoots(scope.ownDirs, abs)) return abs;
```

`withinRoots` already does exactly the right containment test (normalized
prefix, `path === root || path.startsWith(root + "/")`), so a sibling like
`…/silo.tasks/global-evil` and a `..` escape both fall through to the normal
rules. Reusing it rather than writing a second matcher is the point.

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
    if (!ws) return Promise.reject(new Error("No workspace is open"));
    return ensureWorkspaceDir(extensionId, ws.id);
  },
},
```

### `extension-host/extension-manager.ts`

- `uninstall(id, opts?: { deleteData?: boolean })` — the existing body, plus
  `if (opts?.deleteData) await deleteExtensionData(id)` **after** the extension
  is unloaded and its folder removed. A failure there is surfaced but does not
  roll back the uninstall (R5).
- `getDataInfo(id)` on the manager — a thin pass-through to
  `extensionDataInfo`, so the UI never touches path building.

Both are host-internal (`@silo-code/extension-host/internal`); neither reaches
`@silo-code/sdk`.

### `extensions-core/src/extensions` — the uninstall dialog

`ExtensionsPage.uninstall` today calls `ctx.ui.confirm`, which has no room for a
checkbox. The dialog becomes a small host-modal component in the same folder
(`UninstallDialog.tsx`), following `confirm-with-dont-show-again.tsx`'s shape:
the host modal service for the chrome, `CheckboxRow` + `ModalActions` from
`@silo-code/sdk` for the content (ADR 0026 — the kit owns modal _content_).

Flow: `getDataInfo(id)` → if `null`, keep today's plain `ctx.ui.confirm`; if
non-null, open the dialog with the checkbox and a formatted "3 files, 1.2 MB",
then `uninstall(id, { deleteData: checked })`.

Extracted pure helpers (so the logic is testable without rendering, per
`silo-testing`): `formatDataSummary({ files, bytes })` → `"3 files, 1.2 MB"`,
and the outcome mapping `("uninstall" | "cancel", checked) → { uninstall, deleteData }`
mirroring `resolveDialogOutcome`.

### `@silo-code/sdk`

`ExtensionStorageScopes` grows the two methods with `@public` TSDoc that states
(a) the create-on-first-call behaviour, (b) that no `fs:*` permission is needed
_inside_ these paths, and (c) that `workspaceDir()` rejects with no workspace
open. No new type is exported — the return is a plain `Promise<string>`, which
keeps the surface additive and the docs one page.

## Data flow

First write by `silo.tasks` (declares `process` only):

```
activate(ctx)
  └─ await ctx.storage.globalDir()
       └─ userConfigDir()  [already cached]
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
  └─ UninstallDialog → { uninstall: true, deleteData: false }
  └─ mgr.uninstall(id, { deleteData: false })
       ├─ unloadExtension / delete <configRoot>/extensions/<id>
       ├─ drop the installed.json record
       └─ (data left on disk)
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

No migration: nothing writes here today. No schema — the contents are entirely
the extension's business. Nothing about this tree is read at startup; it is
touched only when an extension asks or the user opts into deletion.

## Error handling

| Failure                                   | Behaviour                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `workspaceDir()` with no workspace open   | Rejects with `Error("No workspace is open")` — documented, not a `PathDeniedError` (nothing was denied).           |
| `mkdir` fails (permissions, full disk)    | The rejection propagates from `globalDir()`/`workspaceDir()`; the extension handles it like any I/O failure.       |
| Path outside the own dirs and unpermitted | Unchanged: `PathDeniedError`, same message as today.                                                               |
| `getDataInfo` walk fails                  | Treated as "no data" → plain confirm, no checkbox. Never blocks an uninstall.                                      |
| `deleteExtensionData` fails               | Uninstall still completes; the error is surfaced via `ctx.ui.notify("error", …)` and logged to the Output channel. |
| Storage root unresolved                   | `ownDirs` is `[]` — impossible to observe, since a path can only be obtained by awaiting the root.                 |

## Testing strategy

Co-located Vitest, pure-logic style (`.agents/skills/silo-testing`):

- `security/resolve-path.test.ts` — own-dir allow (read + write), sibling-prefix
  denial, `..`-escape denial, another extension's dir denied, no-workspace-open
  with an own-dir path allowed, `fs:read`/`fs:write` behaviour unchanged, trusted
  pass-through unchanged.
- `extension-storage-dirs.test.ts` — path shape for global/workspace, id
  namespacing, identity-keyed root, `ownDirPaths` empty before the root
  resolves, lazy creation (no `mkdir` until asked), `extensionDataInfo` counting
  and its `null`-when-empty case, invalid-id refusal.
- `context.test.ts` — `ctx.storage.globalDir/workspaceDir` exist, are
  per-extension, track the active workspace, and reject with no workspace open.
- `extension-manager.test.ts` — `uninstall` with and without `deleteData`;
  data-delete failure does not fail the uninstall.
- `UninstallDialog` helpers — `formatDataSummary` (singular/plural, B/KB/MB) and
  the outcome mapping.

The fs is faked at the existing seam these suites already use (the `tauri-fs`
wrappers), so no test touches a real disk.

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
  comes from the SDK kit; the modal shell stays host chrome.
- **[ADR 0019](../../decisions/0019-runtime-extension-loading.md)** — install /
  uninstall lifecycle, which the delete option hangs off.
- **Boundaries** — extensions reach this only through `ctx`; the host module is
  internal. `state/` stays a leaf, so nothing about directories goes into
  `state/workspaces.ts` (this is why workspace deletion doesn't touch the
  filesystem — it couldn't, without breaking the layering).
- **POSIX-only** — `resolve-path.ts` treats paths as POSIX; unchanged here.
