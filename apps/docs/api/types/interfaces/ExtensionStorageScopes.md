# Interface: ExtensionStorageScopes

Defined in: [packages/sdk/src/extension-storage.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L65)

The persisted-storage scopes available to an extension, exposed as
[ExtensionContext.storage](ExtensionContext.md#storage): two key/value bags for settings-sized
state, and the two matching **directories** for real data files.

## Properties

### global

```ts
readonly global: ExtensionStorage;
```

Defined in: [packages/sdk/src/extension-storage.ts:70](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L70)

Per-extension storage shared across **all** workspaces — the place for
an extension's own settings (enabled features, layout choices, etc.).

***

### workspace

```ts
readonly workspace: ExtensionStorage;
```

Defined in: [packages/sdk/src/extension-storage.ts:76](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L76)

Per-extension storage scoped to the **active workspace** — the place for
state that should differ per workspace (last selection, per-project
toggles). The bag is swapped when the active workspace changes.

## Methods

### globalDir()

```ts
globalDir(): Promise<string>;
```

Defined in: [packages/sdk/src/extension-storage.ts:107](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L107)

An absolute path to a **directory of your own**, shared across every
workspace — the filesystem counterpart to [ExtensionStorageScopes.global](#global).
Use it for real data files (a `.jsonl` log, a cache, an export) rather than
inventing a path under the user's home directory.

The directory is created on first call and lives under Silo's user-config
root, namespaced by your extension id:
`~/.config/silo/extension-storage/<your-id>/global`. The path is stable
across calls, activations, and restarts.

**No filesystem permission is needed inside it.** Paths beneath this
directory are readable and writable through [ExtensionContext.files](ExtensionContext.md#files)
without declaring `fs:read` or `fs:write` — your own storage is inside your
sandbox, the same way the open workspace folder is. The lift stops at
`ctx.files`: running a process with a working directory in here still needs
the `process` permission (passing the path to a command as an *argument*
needs nothing extra).

Relative paths passed to `ctx.files` still resolve against the **workspace**,
not this directory — always join onto the absolute path you get back.

```ts
const dir = await ctx.storage.globalDir();
await ctx.files.writeText(`${dir}/tasks.jsonl`, body);
```

Uninstalling your extension does **not** delete this directory unless the
user opts in; the data survives a reinstall.

#### Returns

`Promise`\<`string`\>

***

### workspaceDir()

```ts
workspaceDir(workspaceId?, options?): Promise<string>;
```

Defined in: [packages/sdk/src/extension-storage.ts:135](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L135)

An absolute path to a directory of your own scoped to a **workspace** — the
filesystem counterpart to [ExtensionStorageScopes.workspace](#workspace). Lives at
`~/.config/silo/extension-storage/<your-id>/workspaces/<workspaceId>`.

Everything [ExtensionStorageScopes.globalDir](#globaldir) says about permissions
and relative paths applies here too.

#### Parameters

##### workspaceId?

`string`

Which workspace's directory to resolve. Omit for the
  **active** workspace — the path then changes as the active workspace
  switches, so don't cache it across a switch, and the call rejects with
  `NoWorkspaceError` when no workspace is open. Pass an id (from
  [ExtensionContext.workspaces](ExtensionContext.md#workspaces)) to resolve **any** workspace's
  directory, active or not — the aggregating case (a view over every
  workspace's data).

##### options?

`create` (default `true`) creates the directory if it is
  missing, matching the historical behaviour — every caller that then
  **writes** into the path needs this, because [FileService.writeText](FileService.md#writetext)
  does not create parent directories. Pass `create: false` when you only
  need the path to **read** from (a missing file already reads as absent);
  nothing is written to disk for a workspace that has no data yet.

The directory follows the workspace's **identity**, not its folder path:
deleting a workspace and re-adding the same folder gives you a new, empty
directory (the same rule [ExtensionStorageScopes.workspace](#workspace) follows).
Deleting a workspace leaves the directory on disk.

###### create?

`boolean`

#### Returns

`Promise`\<`string`\>

***

### workspaceDirs()

```ts
workspaceDirs(options?): Promise<readonly WorkspaceStorageDir[]>;
```

Defined in: [packages/sdk/src/extension-storage.ts:155](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L155)

Resolve a storage directory for **every open workspace** in one call — the
building block for a surface that aggregates per-workspace data (a
cross-workspace list, say) without making a separate
[ExtensionStorageScopes.workspaceDir](#workspacedir) call per workspace.

Returns one entry per workspace in
[WorkspaceService.getState](WorkspaceService.md#getstate)`().open`, each `{ workspaceId, dir }`.
There is no ordering guarantee — match entries to workspaces by
`workspaceId`.

#### Parameters

##### options?

`create` (default `true`) behaves exactly as it does on
  [ExtensionStorageScopes.workspaceDir](#workspacedir). The aggregating case passes
  `create: false`: it only reads each workspace's data, so no directory is
  created for a workspace that has none.

###### create?

`boolean`

#### Returns

`Promise`\<readonly [`WorkspaceStorageDir`](WorkspaceStorageDir.md)[]\>
