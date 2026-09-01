---
status: implemented
created: 2026-08-30
---

# 0032. A per-extension storage directory on `ctx`

## Summary

Every extension now gets a host-owned **directory** it can write real files
into — the filesystem counterpart to `ctx.storage`'s key/value bags. An
extension persisting a data file no longer has to invent a path under the
user's home directory and declare `fs:read` + `fs:write` to reach it, which was
both a worse first-run experience and a weaker guarantee than the host can
offer.

## Motivation

`ctx.storage` ([RFC 0004](./0004-ctx-storage.md)) solved settings-sized state:
two namespaced key/value bags, `global` and `workspace`, persisted alongside app
state. Every bundled extension had needed nothing more, which is why this gap
went unnoticed until the Tasks extension ([RFC 0031](./0031-tasks-extension/proposal.md))
needed a genuine **data file** — a newline-delimited JSON list of tasks that
must be greppable, backup-able, exportable, and pointable-at by an agent. That
doesn't belong in the app-state blob: it grows unbounded, it's invisible outside
Silo, and it ties user data to Silo's own persistence format.

With no host-provided directory, the only option was `ctx.system.homeDir()`
plus a self-chosen path, which required declaring `fs:read` and `fs:write` —
asking for the broadest filesystem permission in the model for what is really a
single directory of one's own, with no lifecycle story (the host can't show,
size, or offer to remove data it doesn't know about), no arbitration against
another extension picking the same path, and no parity with the ecosystem (VS
Code has had `globalStorageUri`/`storageUri` for years).

## Design

Two new members on `ctx.storage`, alongside the existing `global`/`workspace`
bags — the same two scopes, expressed as directories:

```ts
interface ExtensionStorageScopes {
  readonly global: ExtensionStorage; // existing
  readonly workspace: ExtensionStorage; // existing

  /** Absolute path to this extension's own directory, shared across workspaces. */
  globalDir(): Promise<string>;
  /** Absolute path to this extension's directory for the active workspace. */
  workspaceDir(): Promise<string>;
}
```

Both are async, create the directory on first call, and resolve to a path under
Silo's user-config root ([ADR 0022](../decisions/0022-on-disk-storage-layout.md)
tier 1 — this **is** user data, not app state), namespaced by extension id and
identity-keyed with everything else beneath it:

```
~/.config/silo[-<identity>]/extension-storage/<extensionId>/
├── global/            ← ctx.storage.globalDir()
└── workspaces/<wsId>/ ← ctx.storage.workspaceDir()
```

The `global`/`workspaces` split (rather than global content sitting directly at
`<extensionId>/`) means `workspaces` is never a name an extension could collide
with inside its own global directory. `workspaceDir()` is keyed by the
workspace's **identity**, following the same rule `ctx.storage.workspace`
already does: delete a workspace and re-add the same folder and you get a new,
empty directory. With no workspace open, `workspaceDir()` rejects with the new
`NoWorkspaceError` — deliberately not a `PathDeniedError`, since nothing was
denied.

**The load-bearing part is the permission behavior:** paths returned by these
methods are readable and writable through `ctx.files` **without** declaring
`fs:read`/`fs:write`. The host already mediates every filesystem call
(`security/resolve-path.ts`), so an extension's own directory joins the open
workspace as a path that's inside its sandbox unconditionally — `PathScope`
gained one member, `ownDirs`, checked right alongside `roots`. The lift stops at
`ctx.files`: a process run with its working directory inside the own directory
still needs `process`, and a command with the path as an _argument_ needs
nothing extra (the Tasks case). This is enforced separately from — and does not
route through — the `ctx.process`/`ctx.search` cwd guards, so the two can never
drift into silently widening each other.

Because `resolvePath` is synchronous and has to decide against these paths
before any extension activates, the storage root is resolved **eagerly at
startup** (`initStorageRoot`, alongside `userConfigDir()` in `main.tsx`), not
lazily on first `globalDir()` call — an extension can cache its absolute path
in `ctx.storage.global` in one session and use it at the top of `activate()` in
the next without ever calling `globalDir()` again.

On Windows the directory paths handed back are drive-absolute (`C:/Users/…`).
`resolve-path.ts` recognizes a Windows drive (`C:/`, `C:\`) and a UNC prefix
(`//`, `\\`) as absolute anchors alongside the POSIX root, normalizing `\` to
`/` and comparing the drive letter case-insensitively. Without this an untrusted
extension's `C:/…` own-dir path was treated as workspace-relative and spliced
onto the workspace root, so every own-dir write failed with `ERROR_INVALID_NAME`
— the first symptoms being `silo.tasks` (RFC 0031 phase 1) and the
`storage-demo` example both unable to write their `.jsonl` on Windows.

The workspace file watcher's project-tree noise filter
(`node_modules/`, `dist/`, `cache/`, …) is bypassed for paths inside extension
storage: an extension is free to name a subfolder `cache/`, and a watcher that
silently never fires there would be a real trap. `start_watch` takes a
`filter_noise` flag; the host decides it, the public `ctx.files.watch` signature
is unchanged.

### Data outlives the extension

The host knows about the directory, so it can offer to clean it up — but it
never deletes a user's files on its own (crystallized as
[ADR 0046](../decisions/0046-never-delete-user-data-unprompted.md), since this
is a rule future features — `ctx.secrets`, workspace-delete cleanup — should
follow rather than re-decide):

- **Uninstall keeps the data by default.** When the directory holds files, the
  uninstall confirm grows an unchecked "Also delete its data (N files, X)"
  checkbox. Reinstalling restores everything; deleting is deliberate and
  informed. Retained data's path is logged to the Output panel, since nothing
  else in the product names it afterward. A directory with no files is removed
  either way — there's nothing to lose.
- **Hard-deleting a workspace leaves its per-extension directories alone**,
  even though the workspace's key/value bag goes away with the workspace file.
  A key/value bag is app state; a `.jsonl` the user has been editing is not.
  Guaranteed by layering: `state/` is a leaf and cannot reach the host's fs
  module, so nothing about directories could go into the workspace-delete path
  even by accident.
- **An id change carries the data with it.** When a third-party extension's id
  is superseded by a built-in (`silo.agent-monitor` → `silo.agents`), the
  storage directory is renamed alongside the key/value migration, behind the
  same "Your settings were kept" toast — keyed on the id mapping itself, not on
  an install record still being present, since the storage directory
  deliberately outlives its install.

## Alternatives considered

**Leave it as `homeDir()` + `fs:write`.** Works today and needs no SDK change.
Rejected: it makes a modest, self-contained extension request the broadest
filesystem permission in the model, and leaves the host with no knowledge of
the data it's storing on the user's behalf.

**A narrower permission** (`fs:own-dir`) rather than a sandbox extension.
Rejected as a permission gating something every extension should have
unconditionally.

**Return a handle rather than a path.** Cleaner in the abstract, but extensions
need real paths to hand to `ctx.process.exec` (a tracker CLI pointed at a
Silo-managed file). A path is the useful currency.

**Extend `ExtensionStorage` with blob values instead.** Keeps one API, but a
task list an agent can `cat` and a user can back up is a file, not a value —
this would recreate the app-state-blob problem under a new name.

**Put the directories under the app-data root.** Rejected once the tier-1 test
was applied: app-data is for state the user isn't meant to edit, and hiding a
data file inside `~/Library/Application Support/com.silo.desktop/` defeats the
reason it's a file at all.

**Delete the directory automatically on uninstall** (RFC 0004's original
sketch). Rejected — see "Data outlives the extension" and
[ADR 0046](../decisions/0046-never-delete-user-data-unprompted.md).

**Key the workspace directory by folder path** rather than workspace id, so
deleting and re-adding a project finds its old data. Rejected: it would give
the two storage scopes two different rules (the key/value `workspace` scope is
already keyed to the workspace and already dies with it), and it breaks on a
folder move/rename while making two workspaces over one folder share data.

## Decision

**Implemented as proposed**, with two deviations settled during verification:

- The id-migration rename (R7) could not run in the same pass as the key/value
  migration as originally sketched — that runs in `state/` (`hydrate`), which
  is a layering leaf and cannot reach the host's fs module. It runs from
  `extension-manager.loadInstalled` instead, keyed directly on the superseded-id
  mapping rather than on an install record still being present: a storage
  directory outlives its install by design, so gating the rename on the record
  would have orphaned the data of anyone who'd uninstalled the old extension
  before the built-in shipped.
- A storage-root resolution failure at startup denies own-dir paths as
  out-of-workspace (the existing `PathDeniedError` message), with the real
  cause logged to the Output panel — not a `PathDeniedError` that names the
  cause inline. Naming it inline would mean threading a failure reason through
  `PathScope` for a failure mode that, in practice, means `userConfigDir()`
  itself is broken and the rest of the app is already in trouble; the
  Output-panel trail is loud enough without the added surface.

Verified against the full requirements set (`pnpm test`, `tsc --noEmit`,
`eslint`/`stylelint`, `cargo test`, `pnpm docs:build`, and a runtime pass in the
dev app driving `examples/extensions/storage-demo-extension` — a permission-free
example built for this — through the real CLI install/uninstall path,
confirmed against the actual files on disk rather than just the extension's own
report). Filed as a follow-up, not fixed here: extension ids that collide only
by letter case on a case-insensitive filesystem
([issue #457](https://github.com/silo-code/silo/issues/457)) — pre-existing for
the `extensions/<id>` code directory, so storage inherits rather than
introduces the behavior; the fix belongs at install time.

The crystallized "never delete without asking" principle is recorded in
[ADR 0046](../decisions/0046-never-delete-user-data-unprompted.md). The
`ctx.storage` roadmap entry is `stable`
([docs](https://getsilo.dev/api/storage/#storage-directories)). The first
consumer is `silo.tasks` in `silo-code/silo-extensions`
([RFC 0031](./0031-tasks-extension/proposal.md)), which drops `fs:read` + `fs:write`
from its manifest once a published SDK carries this.
