# Tasks — 0032. A per-extension storage directory on `ctx`

Working artifact — removed when the proposal collapses. Keep the checkboxes
current as work proceeds.

## Roadmap first (docs-driven)

- [ ] Add `ctx.storage` (per-extension directories) to `apps/docs/roadmap.md` as
      `planned`, with the sketched surface, linking this RFC.

## Host — the storage-dirs module

- [ ] Add `packages/extension-host/src/extension-host/extension-storage-dirs.ts`
      with `initStorageRoot` (cached, over `userConfigDir()`), `ownDirPaths`,
      `isStoragePath`, and the id-charset guard.
- [ ] Add `ensureGlobalDir` / `ensureWorkspaceDir` (lazy `fsCreateDir`).
- [ ] Add a bounded recursive directory walk (entry + depth cap; no such helper
      exists today) and build `extensionDataInfo` on it — file count, byte
      total, `null` when absent or file-free, "unknown size" when capped.
- [ ] Add `deleteExtensionData` and `renameExtensionData`.

## Host — startup ordering (R5)

- [ ] Call `initStorageRoot()` from `apps/desktop/src/main.tsx`, after
      `userConfigDir()` and before `hydrate` / `activateExtensions`.
- [ ] On failure, log the cause to the `silo:extension-host` Output channel and
      leave the root unset (own-dir paths then deny normally).

## Host — the sandbox lift

- [ ] Add the required `ownDirs` member to `PathScope` in
      `security/resolve-path.ts` and allow paths within it (reusing
      `withinRoots`), after `toAbsolute` and before the workspace-root check.
- [ ] Update the file's doc comment so the rule set it states stays accurate.
- [ ] Fix the construction sites the compiler flags: `context.ts`,
      `resolve-path.test.ts`, `scoped-services.test.ts`, and any `PathScope`
      built by the automation bridge.

## Host — `ctx.storage` wiring

- [ ] Give `scope.ownDirs` a live getter in `context.ts` keyed on the active
      workspace.
- [ ] Add `globalDir()` / `workspaceDir()` to the returned `ctx.storage`,
      rejecting with `NoWorkspaceError` when no workspace is open.

## SDK surface

- [ ] Add `NoWorkspaceError` to `packages/sdk/src/permissions.ts` (or a sibling),
      with the `Object.setPrototypeOf` treatment `PathDeniedError` uses, and
      export it from the barrel.
- [ ] Add `globalDir()` / `workspaceDir()` to `ExtensionStorageScopes` in
      `packages/sdk/src/extension-storage.ts` with `@public` TSDoc covering lazy
      creation, the no-`fs:*`-needed rule, relative-path behaviour,
      workspace-identity keying, and `NoWorkspaceError`.
- [ ] Verify `tsc --noEmit` across every package.

## Watcher (R8)

- [ ] Add `filter_noise: bool` to `start_watch`
      (`apps/desktop/src-tauri/src/commands/watch.rs`); consult `should_skip`
      only when it is true.
- [ ] Thread it through `services/tauri-watch.ts`; `getFileService().watch`
      passes `!isStoragePath(path)`. Public `ctx.files.watch` signature
      unchanged.

## Id migration (R7)

- [ ] Call `renameExtensionData(oldId, newId)` from the superseded-id pass in
      `extension-manager.loadInstalled`, alongside `migrateGlobalExtensionState`.
- [ ] Make it idempotent and non-clobbering; log a conflict rather than
      overwriting.

## Uninstall — keep by default, delete on request

- [ ] `extension-manager.uninstall(id, opts?: { deleteData?: boolean })`: delete
      data on opt-in, delete a file-free directory unconditionally, log the
      retained path otherwise, and never fail the uninstall over data.
- [ ] `extension-manager.getDataInfo(id)` pass-through.
- [ ] `UninstallDialog.tsx` in `packages/extensions-core/src/extensions/` built
      on public `ctx.ui.showModal` + `CheckboxRow`/`ModalActions`; unchecked by
      default. No host-internal modal import.
- [ ] Extract `formatDataSummary` and the confirm-outcome mapping as pure
      helpers.
- [ ] `ExtensionsPage.uninstall` uses the dialog when `getDataInfo` is non-null
      and the existing `ctx.ui.confirm` otherwise; error notify on delete
      failure.

## Tests

- [ ] `resolve-path.test.ts` — own-dir allow/deny matrix (R3), including the
      sibling-prefix and `..`-escape cases and the no-workspace-open case.
- [ ] `extension-storage-dirs.test.ts` — path shapes, namespacing, laziness,
      `ownDirPaths` before/after init, `extensionDataInfo` (counting, empty, cap),
      `renameExtensionData` (idempotent, conflict), `isStoragePath`, invalid ids.
- [ ] Startup-ordering test — a cached own-dir path works at the top of
      `activate()` with no preceding `globalDir()` call (R5).
- [ ] `context.test.ts` — the two new methods, per-extension isolation,
      workspace tracking, `NoWorkspaceError` with no workspace.
- [ ] `extension-manager.test.ts` — uninstall with / without `deleteData`;
      empty-dir removal; retained-path logging; delete failure doesn't fail the
      uninstall.
- [ ] `extension-id-migration.test.ts` — storage renamed alongside the kv bag.
- [ ] Watch filtering — Rust unit test for `filter_noise`, TS test that the host
      passes `false` for storage paths.
- [ ] Uninstall-dialog helper tests (`formatDataSummary`, outcome mapping).

## Docs

- [ ] `apps/docs/api/storage/index.md` — both methods, the real on-disk path,
      the permission rule, workspace-identity keying, relative-path behaviour,
      `NoWorkspaceError`, and a worked example (write + read a file).
- [ ] `apps/docs/guide/permissions.md` — an extension's own storage directory
      needs no `fs:read`/`fs:write`.
- [ ] `apps/docs/guide/extension-checklist.md` — "storing a data file? use
      `ctx.storage.globalDir()`, don't invent a path under `$HOME`".
- [ ] `pnpm docs:api` and commit the regenerated reference.
- [ ] Flip the roadmap entry to `stable`.
- [ ] `docs/domain-language.md` — add _extension storage directory_ if the
      glossary needs the term (`silo-domain-modeling`).
- [ ] Update the two links to this RFC in `docs/proposals/0031-tasks-extension.md`
      for the new package path.

## Follow-ups to file, not to build here

- [ ] Open an issue for install-time extension-id uniqueness on
      case-insensitive filesystems (pre-existing for `extensions/<id>`; storage
      inherits it).
- [ ] Decide during verification whether built-in extensions need any data
      removal path at all, given they can only be disabled (R6 out-of-scope
      note).

## Verification

- [ ] Every requirement in `requirements.md` is met or explicitly noted as not.
- [ ] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, and `pnpm lint` pass.
- [ ] Runtime check in the dev app (`verifier-gui`): an extension writes to its
      own dir with no `fs:*` declared; the file lands at the documented path; a
      watch on a `cache/` subfolder fires; uninstall with the box unchecked
      leaves the data and logs its path, with the box checked removes it.
- [ ] Durable decisions recorded as ADRs — in particular, decide whether
      "the host never deletes user data without asking" deserves its own ADR
      rather than living only in this proposal.
- [ ] Proposal collapsed to a single curated
      `docs/proposals/0032-ctx-extension-storage-directory.md`, naming
      `silo-code/silo-extensions` (`tasks/`) as the downstream consumer that
      drops `fs:read` + `fs:write` once a published SDK carries this.
