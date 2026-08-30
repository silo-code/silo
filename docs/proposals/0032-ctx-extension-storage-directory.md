---
status: draft # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-08-30
---

# 0032. A per-extension storage directory on `ctx`

## Summary

Give every extension a host-owned **directory** it can write real files into —
the filesystem counterpart to `ctx.storage`'s key/value bags. An extension that
persists a data file today has to invent a path under the user's home directory
and declare `fs:read` + `fs:write` to reach it, which is both a worse first-run
experience and a weaker guarantee than the host can offer.

## Motivation

`ctx.storage` ([RFC 0004](./0004-ctx-storage.md)) solved settings-sized state:
two namespaced key/value bags, `global` and `workspace`, persisted alongside app
state. Every bundled extension to date has needed nothing more, which is why this
gap has gone unnoticed.

The Tasks extension ([RFC 0031](./0031-tasks-extension.md)) is the first with a
genuine **data file** — a newline-delimited JSON list of tasks that must be
greppable, backup-able, exportable, and pointable-at by an agent. That does not
belong in the app-state blob: it grows unbounded, it is invisible outside Silo,
and it ties user data to Silo's own persistence format.

With no host-provided directory, the extension's only option is
`ctx.system.homeDir()` plus a path it chooses itself (`~/.silo/tasks/…`), which
requires declaring `fs:read` and `fs:write`. That is a poor trade:

- **The consent prompt overstates the ask.** An extension whose entire pitch is
  "your tasks never leave your machine" asks at install for the right to read and
  write _anywhere on the filesystem_ — because that is the only permission that
  exists — when what it needs is a single directory of its own.
- **No cleanup story.** RFC 0004 named uninstall cleanup as a motivation for
  host-managed storage. A directory the extension invented is outside the host's
  knowledge, so it leaks on uninstall exactly the way per-panel storage did.
- **Path collisions.** Two extensions independently picking `~/.silo/` is a
  question of time, and nothing arbitrates it.
- **No parity with the ecosystem.** VS Code has had `globalStorageUri` /
  `storageUri` for years; extension authors will expect it.

## Design

Two new members on `ctx.storage`, alongside the existing `global` / `workspace`
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
Silo's app-data root, namespaced by extension id — consistent with the on-disk
layout in ADR [0022](../decisions/0022-on-disk-storage-layout.md).

The load-bearing part is the permission behaviour: **paths returned by these
methods are readable and writable through `ctx.files` without declaring
`fs:read` / `fs:write`.** The host already mediates every filesystem call, so it
can treat an extension's own directory as inside its sandbox — the same way the
open workspace folder already is. That is the whole point; without it the
methods are a naming convenience and the consent prompt is unchanged.

Consequences the host owns:

- **Uninstall removes the directory**, closing the cleanup gap RFC 0004 named.
- **The workspace directory follows the active workspace**, like the
  `workspace` bag, and is removed when that workspace is hard-deleted.
- Directories are created lazily, so an extension that never calls these costs
  nothing.

## Alternatives considered

**Leave it as `homeDir()` + `fs:write`.** Works today and needs no SDK change.
Rejected: it makes a modest, self-contained extension request the broadest
filesystem permission in the model, and it leaves nothing to clean up on
uninstall.

**A narrower permission** (`fs:own-dir`) rather than a sandbox extension.
Rejected as a permission that grants access to something the extension should
have unconditionally — every extension has a right to its own storage.

**Return a handle rather than a path.** Cleaner in the abstract, but extensions
need real paths to hand to `ctx.process.exec` (a tracker CLI pointed at a
Silo-managed file, exactly the Tasks case). A path is the useful currency.

**Extend `ExtensionStorage` with blob values instead.** Keeps one API, but a task
list that an agent can `cat` and a user can back up is a file, not a value. It
would recreate the app-state-blob problem under a new name.

## Decision

_Pending._ Fill in when this leaves `draft`.
