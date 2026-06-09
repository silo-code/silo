# Interface: DiffContentRequest

Defined in: [packages/sdk/src/editor-service.ts:106](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L106)

The request a [DiffContentProvider](../type-aliases/DiffContentProvider.md) receives to resolve a diff's two
sides — the [OpenDiffSpec](OpenDiffSpec.md)'s `filePath`/`args` plus the folder of the
workspace the diff lives in (the natural cwd for path-relative providers).

## Properties

### filePath

```ts
filePath: string;
```

Defined in: [packages/sdk/src/editor-service.ts:108](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L108)

The file the diff is OF (from [OpenDiffSpec.filePath](OpenDiffSpec.md#filepath)).

***

### args?

```ts
optional args?: Record<string, unknown>;
```

Defined in: [packages/sdk/src/editor-service.ts:110](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L110)

The provider's args (from [OpenDiffSpec.args](OpenDiffSpec.md#args)).

***

### workspaceFolder

```ts
workspaceFolder: string | null;
```

Defined in: [packages/sdk/src/editor-service.ts:112](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L112)

Folder of the workspace the diff lives in, or `null` if none.
