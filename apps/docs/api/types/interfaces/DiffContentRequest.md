# Interface: DiffContentRequest

Defined in: [packages/sdk/src/editor-service.ts:129](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L129)

The request a [DiffContentProvider](../type-aliases/DiffContentProvider.md) receives to resolve a diff's two
sides — the [OpenDiffSpec](OpenDiffSpec.md)'s `filePath`/`args` plus the workspace
folder that contains that file (the natural cwd for path-relative providers).
In a multi-root workspace this is the matching root (primary or an
`extraFolder` such as an opened git worktree), not always the primary folder.

## Properties

### filePath

```ts
filePath: string;
```

Defined in: [packages/sdk/src/editor-service.ts:131](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L131)

The file the diff is OF (from [OpenDiffSpec.filePath](OpenDiffSpec.md#filepath)).

***

### args?

```ts
optional args?: Record<string, unknown>;
```

Defined in: [packages/sdk/src/editor-service.ts:133](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L133)

The provider's args (from [OpenDiffSpec.args](OpenDiffSpec.md#args)).

***

### workspaceFolder

```ts
workspaceFolder: string | null;
```

Defined in: [packages/sdk/src/editor-service.ts:139](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L139)

Workspace root that contains [DiffContentRequest.filePath](#filepath), or
`null` if none. Prefer this over the workspace primary folder when roots
differ (e.g. a linked worktree opened alongside).
