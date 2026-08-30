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
- [ ] It rejects with a clear error when no workspace is open.
- [ ] It never collides with `globalDir()`'s contents — an extension writing a
      file named `workspaces` into its global directory is impossible.
- [ ] Nothing is created on disk for an extension that never calls it.

## R3 — Own directories are inside the extension's `ctx.files` sandbox

An extension can read and write anywhere beneath its own directories through
`ctx.files` **without** declaring `fs:read` or `fs:write`.

### Acceptance criteria

- [ ] With no permissions declared and no workspace open, `ctx.files.writeText`
      succeeds for a path under `globalDir()`.
- [ ] The same holds for `readText`, `readBytes`, `readDir`, `stat`,
      `pathExists`, `writeBytes`, `createDir`, `copy` (either side), `rename`,
      `delete`, `reveal`, and `watch`.
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

## R5 — Data survives uninstall unless the user opts in

Uninstalling an extension never deletes its storage directory on its own.

### Acceptance criteria

- [ ] Uninstalling with the checkbox unchecked leaves
      `extension-storage/<id>/` byte-for-byte intact.
- [ ] Reinstalling the extension afterwards sees its previous data.
- [ ] When the directory exists and is non-empty, the uninstall confirm shows an
      unchecked "Also delete its data (N files, X)" checkbox with a real file
      count and human-readable size.
- [ ] When the directory is absent or empty, no checkbox is shown and the
      confirm reads as it does today.
- [ ] Confirming with the checkbox checked removes `extension-storage/<id>/`
      recursively — including its `workspaces/` subtree.
- [ ] Cancelling the confirm deletes nothing and uninstalls nothing.
- [ ] Uninstall succeeds even if deleting the data fails; the failure is
      reported and does not leave the extension half-uninstalled.

## R6 — Workspace deletion leaves extension data alone

### Acceptance criteria

- [ ] Hard-deleting a workspace leaves every
      `extension-storage/<id>/workspaces/<deletedId>/` directory on disk.
- [ ] No new prompt or confirm step appears in the workspace-delete flow.

## R7 — Documented as a public SDK surface

The two methods are part of `@silo-code/sdk` and documented in the same change
(`AGENTS.md` → Self-documentation, `silo-docs-sync`).

### Acceptance criteria

- [ ] Both methods carry TSDoc with `@public` and the right `@category`, and are
      reachable from the `@silo-code/sdk` barrel.
- [ ] `apps/docs/api/storage/index.md` documents both, including the "no
      `fs:read`/`fs:write` needed inside your own directory" rule and the
      on-disk location.
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
  uninstalled.
- Windows path scoping — `resolve-path.ts` is POSIX-only today and stays so.
- A migration for extensions currently storing data under `~/…` of their own
  choosing (none exist).
