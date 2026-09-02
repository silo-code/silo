# Interface: WorkspaceStorageDir

Defined in: [packages/sdk/src/extension-storage.ts:46](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L46)

One workspace's per-extension storage directory, as returned by
[ExtensionStorageScopes.workspaceDirs](ExtensionStorageScopes.md#workspacedirs): the workspace's id paired with
the absolute path to that workspace's directory for the calling extension.

## Properties

### workspaceId

```ts
readonly workspaceId: string;
```

Defined in: [packages/sdk/src/extension-storage.ts:48](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L48)

The workspace this directory belongs to.

***

### dir

```ts
readonly dir: string;
```

Defined in: [packages/sdk/src/extension-storage.ts:54](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L54)

Absolute path to `~/.config/silo/extension-storage/<your-id>/workspaces/<workspaceId>`.
Readable and writable through [ExtensionContext.files](ExtensionContext.md#files) with no
`fs:*` permission, like every other own-storage path.
