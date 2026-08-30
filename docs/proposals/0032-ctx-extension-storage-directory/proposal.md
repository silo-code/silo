---
status: accepted # draft | accepted | implemented | rejected | superseded-by NNNN
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

`ctx.storage` ([RFC 0004](../0004-ctx-storage.md)) solved settings-sized state:
two namespaced key/value bags, `global` and `workspace`, persisted alongside app
state. Every bundled extension to date has needed nothing more, which is why this
gap has gone unnoticed.

The Tasks extension ([RFC 0031](../0031-tasks-extension/proposal.md)) is the first with a
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
- **No lifecycle story.** A directory the extension invented is outside the
  host's knowledge: Silo can't show it, can't size it, and can't offer to remove
  it when the extension goes away.
- **Path collisions.** Two extensions independently picking `~/.silo/` is a
  question of time, and nothing arbitrates it.
- **No parity with the ecosystem.** VS Code has had `globalStorageUri` /
  `storageUri` for years; extension authors will expect it.

## Proposed solution

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
Silo's **user-config root** ([ADR 0022](../../decisions/0022-on-disk-storage-layout.md)
tier 1), namespaced by extension id:

```
~/.config/silo[-<identity>]/
├── extensions/                     # installed extension code (existing)
├── extension-storage/              # NEW — per-extension data
│   └── silo.tasks/
│       ├── global/…                # ctx.storage.globalDir()
│       └── workspaces/<wsId>/…     # ctx.storage.workspaceDir()
├── workspaces/
└── themes/
```

Tier 1, not the app-data dir, because this **is user data**: the entire point of
the Tasks file is that a person can find it, `grep` it, back it up, and point an
agent at it. That is ADR 0022's own test for the config tier.

The load-bearing part is the permission behaviour: **paths returned by these
methods are readable and writable through `ctx.files` without declaring
`fs:read` / `fs:write`.** The host already mediates every filesystem call, so it
can treat an extension's own directory as inside its sandbox — the same way the
open workspace folder already is. That is the whole point; without it the
methods are a naming convenience and the consent prompt is unchanged.

The lift stops at `ctx.files`. Running a process with a working directory inside
the own directory still needs `process`, so one permission keeps one meaning.
Handing the path to a CLI as an _argument_ needs nothing extra, which is the
Tasks case.

### Data outlives the extension

The host knows about the directory, so it can offer to clean it up — but it
never deletes a user's files on its own:

- **Uninstall keeps the data by default.** When the directory holds files, the
  existing "Uninstall X?" confirm grows an unchecked _"Also delete its data
  (3 files, 1.2 MB)"_ checkbox. Reinstalling restores everything; deleting is
  deliberate and informed. Retained data has its path written to the Output
  panel, because nothing else in the product names it afterwards. A directory
  with no files in it is simply removed — there is nothing to lose.
- **Hard-deleting a workspace leaves its per-extension directories alone**, even
  though the workspace's key/value bag goes away with the workspace file. A
  key/value bag is app state; a `.jsonl` the user has been editing is not.
- **An id change carries the data with it.** Silo already migrates an
  extension's key/value bag when its id is superseded by a built-in
  (`silo.agent-monitor` → `silo.agents`), behind a toast promising _"Your
  settings were kept."_ The storage directory is renamed in the same pass, so
  files keep that promise too.

This is a deliberate departure from RFC 0004's sketch of automatic
uninstall-time cleanup: silently deleting files a user could have been editing
is a worse failure than leaving bytes on disk in a directory they can find.

## Scope

**In:** the two SDK methods and their host implementation; a `NoWorkspaceError`
on the SDK; the on-disk layout; the `ctx.files` sandbox lift for own
directories; carrying storage across an extension-id migration; exempting
storage paths from the file watcher's project-tree noise filter (an extension
naming a subfolder `cache/` or `build/` must not get a watcher that silently
never fires); the opt-in delete at uninstall; docs (`ctx.storage` page,
permissions guide, roadmap flip) and tests.

**Out:** `ctx.secrets`; cleanup of the `global`/`workspace` **key/value**
namespaces on uninstall (RFC 0004's other open gap — untouched here); any UI for
managing the data of an already-uninstalled extension — including built-ins,
which can only be disabled, never uninstalled; extension ids that collide only
by letter case on a case-insensitive filesystem (already true of the
`extensions/<id>` code directory today, so storage inherits it rather than
introducing it); Windows path scoping (`resolve-path.ts` is POSIX today);
sandboxed execution ([ADR 0015](../../decisions/0015-phased-security-model.md)
phase 4).

The first consumer is `silo.tasks` in `silo-code/silo-extensions`
([RFC 0031](../0031-tasks-extension/proposal.md)), which drops `fs:read` + `fs:write` from
its manifest once this ships.

## Alternatives considered

**Leave it as `homeDir()` + `fs:write`.** Works today and needs no SDK change.
Rejected: it makes a modest, self-contained extension request the broadest
filesystem permission in the model, and it leaves the host with no knowledge of
the data it is storing on the user's behalf.

**A narrower permission** (`fs:own-dir`) rather than a sandbox extension.
Rejected as a permission that grants access to something the extension should
have unconditionally — every extension has a right to its own storage.

**Return a handle rather than a path.** Cleaner in the abstract, but extensions
need real paths to hand to `ctx.process.exec` (a tracker CLI pointed at a
Silo-managed file, exactly the Tasks case). A path is the useful currency.

**Extend `ExtensionStorage` with blob values instead.** Keeps one API, but a task
list that an agent can `cat` and a user can back up is a file, not a value. It
would recreate the app-state-blob problem under a new name.

**Put the directories under the app-data root** (as this RFC's first draft said).
Rejected once the tier-1 test was applied: app-data is for state the user isn't
meant to edit, and hiding the Tasks file inside
`~/Library/Application Support/com.silo.desktop/` defeats the reason it is a file.

**Delete the directory automatically on uninstall.** RFC 0004's original sketch.
Rejected: see "Data outlives the extension" above.

**Key the workspace directory by folder path** rather than workspace id, so
deleting and re-adding a project finds its old data. Rejected: it would give the
two storage scopes two different rules — `ctx.storage.workspace`'s key/value bag
is already keyed to the workspace and already dies with it — and it breaks when
a folder is moved or renamed, while making two workspaces over one folder share
data. RFC 0031's objection to workspace ids was about writing them into task
data that may be shared or committed; a host-owned path on the user's own disk
is not that. Documented instead: the directory follows the workspace, not the
folder.

## Decision

_Pending._ Fill in when this leaves `accepted`.
