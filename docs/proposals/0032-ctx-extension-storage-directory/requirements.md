# Requirements — 0032. A per-extension storage directory on `ctx`

The behavioral specification. Working artifact — removed when the proposal
collapses.

## R1 — A global storage directory per extension

`ctx.storage.globalDir()` resolves to an absolute path to a directory owned by
the calling extension and shared across every workspace.

### Acceptance criteria

- [ ] `globalDir()` resolves to `<configRoot>/extension-storage/<extensionId>/global`.
- [ ] The directory (and its parents) exists once the promise resolves.
- [ ] Two different extensions never receive the same path.
- [ ] The path is stable across calls, across activations, and across app
      restarts for the same extension id and build identity.
- [ ] The path is identity-keyed: a "Silo Dev" build resolves under
      `~/.config/silo-dev`, a production build under `~/.config/silo` (ADR 0022).
- [ ] Nothing is created on disk for an extension that never calls it.

## R2 — A workspace storage directory per extension

`ctx.storage.workspaceDir()` resolves to an absolute path to a directory owned
by the calling extension and scoped to the **active** workspace.

### Acceptance criteria

- [ ] `workspaceDir()` resolves to
      `<configRoot>/extension-storage/<extensionId>/workspaces/<workspaceId>`.
- [ ] Called again after the active workspace changes, it resolves to the new
      workspace's directory.
- [ ] With no workspace open it rejects with the SDK's `NoWorkspaceError`, and
      `err instanceof NoWorkspaceError` is true across the host↔extension
      boundary (the `PathDeniedError` prototype-chain treatment).
- [ ] It never collides with `globalDir()`'s contents — an extension writing a
      file named `workspaces` into its global directory is impossible.
- [ ] Nothing is created on disk for an extension that never calls it.
- [ ] The directory follows workspace **identity**, not folder path: deleting a
      workspace and re-adding the same folder yields a new, empty directory.
      Documented, not worked around (see `design.md` → Workspace keying).

## R3 — Own directories are inside the extension's `ctx.files` sandbox

An extension can read and write anywhere beneath its own directories through
`ctx.files` **without** declaring `fs:read` or `fs:write`.

### Acceptance criteria

- [ ] With no permissions declared and no workspace open, `ctx.files.writeText`
      succeeds for a path under `globalDir()`.
- [ ] The same holds for `readText`, `readBytes`, `readDir`, `stat`,
      `pathExists`, `writeBytes`, `createDir`, `copy` (either side), `rename`,
      `delete`, and `reveal`.
- [ ] `ctx.files.watch` on an own directory delivers events for **every**
      subdirectory name, including `dist/`, `build/`, `cache/`, `.cache/`,
      `target/`, `node_modules/`, and `.next/` — the host's project-tree noise
      filter must not apply inside extension storage (see R8).
- [ ] A path that merely _starts with_ the directory's string but is a sibling
      (`…/silo.tasks/global-evil`) is denied.
- [ ] A path that escapes via `..` from inside the own directory is denied.
- [ ] Another extension's storage directory is denied (it is outside this
      extension's own dirs, and no permission is declared).
- [ ] An extension holding `fs:read`/`fs:write` is unaffected — behaviour for
      every other path is exactly as it is today.
- [ ] Trusted (bundled) extensions, which bypass scoping entirely, still get the
      same paths from `globalDir()` / `workspaceDir()`.

## R4 — The lift does not widen anything but `ctx.files`

### Acceptance criteria

- [ ] `ctx.process.exec` with `cwd` inside an own directory is still denied
      without the `process` permission.
- [ ] No new `Permission` value is added to the SDK.
- [ ] The install-time consent prompt is unchanged for an extension that only
      uses its own directory (it declares nothing, so it shows nothing).

## R5 — An own-dir path works from the first line of `activate()`

A path obtained in an earlier session (cached by the extension in
`ctx.storage.global`, say) and used before any `globalDir()` call in this
session must be accepted, not intermittently denied.

### Acceptance criteria

- [ ] The storage root is resolved during host startup, before any extension is
      activated.
- [ ] `ctx.files.writeText(<cached own-dir path>)` called synchronously at the
      top of `activate()` — with no preceding `globalDir()` call — succeeds.
- [ ] The path-scope's own-dir list is non-empty for every extension from its
      first activation onward.
- [ ] If root resolution fails at startup, own-dir paths are denied with a
      message naming the cause, and the failure is logged to the Output panel —
      it never silently degrades to "outside the workspace".

## R6 — Data survives uninstall unless the user opts in

Uninstalling an extension never deletes its storage directory on its own.

### Acceptance criteria

- [ ] Uninstalling with the checkbox unchecked leaves
      `extension-storage/<id>/` byte-for-byte intact.
- [ ] Reinstalling the extension afterwards sees its previous data.
- [ ] When the directory exists and holds at least one file, the uninstall
      confirm shows an unchecked "Also delete its data (N files, X)" checkbox
      with a real file count and human-readable size.
- [ ] When the directory is absent, no checkbox is shown and the confirm reads
      as it does today.
- [ ] When the directory exists but contains no files, no checkbox is shown and
      the uninstall removes it silently — there is nothing to lose.
- [ ] Confirming with the checkbox checked removes `extension-storage/<id>/`
      recursively — including its `workspaces/` subtree.
- [ ] Cancelling the confirm deletes nothing and uninstalls nothing.
- [ ] Uninstall succeeds even if deleting the data fails; the failure is
      reported and does not leave the extension half-uninstalled.
- [ ] When data is retained, its absolute path is written to the Output panel,
      so a user who declines deletion can still find it later.

## R7 — Storage follows an extension across an id migration

`SUPERSEDED_BUILTIN_IDS` (`state/extension-id-migration.ts`) already moves an
extension's key/value bag when its id changes, and the migration toast tells the
user _"Your settings were kept."_ Files must not contradict that.

### Acceptance criteria

- [ ] Migrating `oldId` → `newId` moves `extension-storage/<oldId>/` to
      `extension-storage/<newId>/`, preserving the `global/` and `workspaces/`
      subtrees.
- [ ] The move runs in the same migration pass as `migrateGlobalExtensionState`,
      and is idempotent (re-running finds nothing to do).
- [ ] A pre-existing `extension-storage/<newId>/` is not overwritten; the old
      directory is left in place and the conflict is logged.
- [ ] A migration with no old storage directory is a no-op, not an error.

## R8 — Watching an own directory is not noise-filtered

`start_watch` (`src-tauri/src/commands/watch.rs`) drops any event whose path
contains `/node_modules/`, `/target/`, `/dist/`, `/build/`, `/.next/`, or
`/.cache/`. That filter is for project trees.

### Acceptance criteria

- [ ] A watch started on a path inside `extension-storage/` receives events for
      files under those names.
- [ ] A watch on a workspace path keeps today's filtering exactly — no extra
      events reach the file explorer, git panel, or any existing consumer.
- [ ] The choice is made by the host, not the extension: the public
      `ctx.files.watch` signature is unchanged.

## R9 — Workspace deletion leaves extension data alone

### Acceptance criteria

- [ ] Hard-deleting a workspace leaves every
      `extension-storage/<id>/workspaces/<deletedId>/` directory on disk.
- [ ] No new prompt or confirm step appears in the workspace-delete flow.

## R10 — Documented as a public SDK surface

The two methods are part of `@silo-code/sdk` and documented in the same change
(`AGENTS.md` → Self-documentation, `silo-docs-sync`).

### Acceptance criteria

- [ ] Both methods and `NoWorkspaceError` carry TSDoc with `@public` and the
      right `@category`, and are reachable from the `@silo-code/sdk` barrel.
- [ ] `apps/docs/api/storage/index.md` documents both, naming the **real
      on-disk path** (`~/.config/silo/extension-storage/<id>/…`), the "no
      `fs:read`/`fs:write` needed inside your own directory" rule, the
      workspace-identity keying, and the fact that relative paths still resolve
      against the workspace.
- [ ] `apps/docs/guide/permissions.md` states that an extension's own storage
      directory needs no filesystem permission.
- [ ] `apps/docs/roadmap.md` carries the entry, `planned` first and `stable`
      when it ships.
- [ ] `pnpm docs:api` regenerated output is committed.
- [ ] `docs/domain-language.md` defines _extension storage directory_ if the
      glossary needs the term.

## Out of scope

- `ctx.secrets` (RFC 0004's other open item).
- Cleanup of the `global`/`workspace` **key/value** namespaces on uninstall.
- Any UI for finding or deleting data belonging to an extension that is already
  uninstalled. **Known limitation:** built-in extensions can only be disabled,
  never uninstalled, so a built-in that stores files has no in-product removal
  path at all — the Output-panel path (R6) is the only pointer a user gets.
- Case-colliding extension ids (`Silo.Tasks` vs `silo.tasks`) on
  case-insensitive filesystems. **Pre-existing:** installed extension _code_
  already shares one directory (`extensions/<id>`) in that situation, so storage
  inherits the behaviour rather than introducing it. The fix belongs at install
  time, as its own change.
- Windows path scoping — `resolve-path.ts` is POSIX-only today and stays so.
- A migration for extensions currently storing data under `~/…` of their own
  choosing (none exist).
