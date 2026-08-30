# Interface: ExtensionStorageScopes

Defined in: [packages/sdk/src/extension-storage.ts:46](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L46)

The persisted-storage scopes available to an extension, exposed as
[ExtensionContext.storage](ExtensionContext.md#storage): two key/value bags for settings-sized
state, and the two matching **directories** for real data files.

## Properties

### global

```ts
readonly global: ExtensionStorage;
```

Defined in: [packages/sdk/src/extension-storage.ts:51](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L51)

Per-extension storage shared across **all** workspaces — the place for
an extension's own settings (enabled features, layout choices, etc.).

***

### workspace

```ts
readonly workspace: ExtensionStorage;
```

Defined in: [packages/sdk/src/extension-storage.ts:57](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L57)

Per-extension storage scoped to the **active workspace** — the place for
state that should differ per workspace (last selection, per-project
toggles). The bag is swapped when the active workspace changes.

## Methods

### globalDir()

```ts
globalDir(): Promise<string>;
```

Defined in: [packages/sdk/src/extension-storage.ts:88](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L88)

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
workspaceDir(): Promise<string>;
```

Defined in: [packages/sdk/src/extension-storage.ts:107](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L107)

An absolute path to a directory of your own scoped to the **active
workspace** — the filesystem counterpart to
[ExtensionStorageScopes.workspace](#workspace). Created on first call, at
`~/.config/silo/extension-storage/<your-id>/workspaces/<workspaceId>`.

Everything [ExtensionStorageScopes.globalDir](#globaldir) says about permissions
and relative paths applies here too. Call it again after the active
workspace changes — the path changes with it, so don't cache it across a
workspace switch.

The directory follows the workspace's **identity**, not its folder path:
deleting a workspace and re-adding the same folder gives you a new, empty
directory (the same rule [ExtensionStorageScopes.workspace](#workspace) follows).
Deleting a workspace leaves the directory on disk.

Rejects with `NoWorkspaceError` when no workspace is open.

#### Returns

`Promise`\<`string`\>
