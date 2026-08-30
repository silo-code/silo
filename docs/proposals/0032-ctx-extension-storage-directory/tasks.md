# Tasks — 0032. A per-extension storage directory on `ctx`

Working artifact — removed when the proposal collapses. Keep the checkboxes
current as work proceeds.

## Roadmap first (docs-driven)

- [ ] Add `ctx.storage` (per-extension directories) to `apps/docs/roadmap.md` as
      `planned`, with the sketched surface, linking this RFC.

## Host — the storage-dirs module

- [ ] Add `packages/extension-host/src/extension-host/extension-storage-dirs.ts`:
      cached `storageRoot()` over `userConfigDir()`, sync `globalDirPath` /
      `workspaceDirPath` / `ownDirPaths`, id-charset guard.
- [ ] Add `ensureGlobalDir` / `ensureWorkspaceDir` (lazy `fsCreateDir`).
- [ ] Add `extensionDataInfo` (recursive file count + byte total, `null` when
      absent or empty) and `deleteExtensionData`.

## Host — the sandbox lift

- [ ] Add `ownDirs` to `PathScope` in `security/resolve-path.ts` and allow paths
      within it (reusing `withinRoots`), before the workspace-root check and
      before the permission check.
- [ ] Update the file's doc comment so the rule set it states stays accurate.
- [ ] Audit every `PathScope` construction site (`context.ts`, tests, any
      automation bridge) for the new member.

## Host — `ctx.storage` wiring

- [ ] Give `scope.ownDirs` a live getter in `context.ts` keyed on the active
      workspace.
- [ ] Add `globalDir()` / `workspaceDir()` to the returned `ctx.storage`,
      rejecting with a clear error when no workspace is open.

## SDK surface

- [ ] Add `globalDir()` / `workspaceDir()` to `ExtensionStorageScopes` in
      `packages/sdk/src/extension-storage.ts` with `@public` TSDoc covering
      lazy creation, the no-`fs:*`-needed rule, and the no-workspace rejection.
- [ ] Confirm the barrel (`packages/sdk/src/index.ts`) needs no new export
      (the interface is already exported) and that `tsc` agrees across packages.

## Uninstall — keep by default, delete on request

- [ ] `extension-manager.uninstall(id, opts?: { deleteData?: boolean })`, data
      removal after unload + folder delete, failure surfaced without failing the
      uninstall.
- [ ] `extension-manager.getDataInfo(id)` pass-through.
- [ ] `UninstallDialog.tsx` in `packages/extensions-core/src/extensions/`:
      host modal shell + `CheckboxRow`/`ModalActions` from the SDK kit; unchecked
      by default.
- [ ] Extract `formatDataSummary` and the confirm-outcome mapping as pure
      helpers.
- [ ] `ExtensionsPage.uninstall` uses the dialog when `getDataInfo` is non-null
      and the existing `ctx.ui.confirm` otherwise; error notify on delete
      failure.

## Tests

- [ ] `resolve-path.test.ts` — own-dir allow/deny matrix (R3), including the
      sibling-prefix and `..`-escape cases and the no-workspace-open case.
- [ ] `extension-storage-dirs.test.ts` — path shapes, namespacing, laziness,
      `ownDirPaths` before the root resolves, `extensionDataInfo`, invalid ids.
- [ ] `context.test.ts` — the two new `ctx.storage` methods, per-extension
      isolation, workspace tracking, rejection with no workspace.
- [ ] `extension-manager.test.ts` — uninstall with / without `deleteData`;
      delete failure doesn't fail the uninstall.
- [ ] Uninstall-dialog helper tests (`formatDataSummary`, outcome mapping).

## Docs

- [ ] `apps/docs/api/storage/index.md` — both methods, the on-disk location, the
      permission rule, and a worked example (write + read a file).
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

## Downstream (separate change, `silo-code/silo-extensions`)

- [ ] Once a published SDK carries this: `silo.tasks` uses
      `ctx.storage.globalDir()` / `workspaceDir()` and drops `fs:read` +
      `fs:write` from its manifest. Note the published-SDK lag
      (`docs/silo-extensions-repo.md`) — until then it keeps the `$HOME` path.

## Verification

- [ ] Every requirement in `requirements.md` is met or explicitly noted as not.
- [ ] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, and `pnpm lint` pass.
- [ ] Runtime check in the dev app (`verifier-gui`): an extension writes to its
      own dir with no `fs:*` declared; the file lands at the documented path;
      uninstall with the box unchecked leaves it; with the box checked removes it.
- [ ] Durable decisions recorded as ADRs — in particular, decide whether
      "the host never deletes user data without asking" deserves its own ADR
      rather than living only in this proposal.
- [ ] Proposal collapsed to a single curated
      `docs/proposals/0032-ctx-extension-storage-directory.md`.
