# Interface: DiffContentRequest

Defined in: [packages/sdk/src/editor-service.ts:127](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L127)

The request a [DiffContentProvider](../type-aliases/DiffContentProvider.md) receives to resolve a diff's two
sides — the [OpenDiffSpec](OpenDiffSpec.md)'s `filePath`/`args` plus the folder of the
workspace the diff lives in (the natural cwd for path-relative providers).

## Properties

### filePath

```ts
filePath: string;
```

Defined in: [packages/sdk/src/editor-service.ts:129](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L129)

The file the diff is OF (from [OpenDiffSpec.filePath](OpenDiffSpec.md#filepath)).

***

### args?

```ts
optional args?: Record<string, unknown>;
```

Defined in: [packages/sdk/src/editor-service.ts:131](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L131)

The provider's args (from [OpenDiffSpec.args](OpenDiffSpec.md#args)).

***

### workspaceFolder

```ts
workspaceFolder: string | null;
```

Defined in: [packages/sdk/src/editor-service.ts:133](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L133)

Folder of the workspace the diff lives in, or `null` if none.
