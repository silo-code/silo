# Interface: OpenDiffSpec

Defined in: [packages/sdk/src/editor-service.ts:93](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L93)

What to open in a diff view, passed to [EditorService.openDiff](EditorService.md#opendiff). The
diff is **generic** — it renders two contents and knows nothing about where
they come from. `providerId` names a [DiffContentProvider](../type-aliases/DiffContentProvider.md) (registered
via [EditorService.registerDiffContentProvider](EditorService.md#registerdiffcontentprovider)) that resolves the two
sides; `args` is the serializable payload that provider needs (e.g. a git
revision/mode) and is persisted so the content can be recomputed on restart.

## Properties

### filePath

```ts
filePath: string;
```

Defined in: [packages/sdk/src/editor-service.ts:95](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L95)

The file the diff is OF — drives language detection, breadcrumb, title.

***

### providerId

```ts
providerId: string;
```

Defined in: [packages/sdk/src/editor-service.ts:97](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L97)

Id of the registered content provider that resolves the two sides.

***

### args?

```ts
optional args?: Record<string, unknown>;
```

Defined in: [packages/sdk/src/editor-service.ts:99](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L99)

Serializable args handed back to the provider to (re)compute content.

***

### title?

```ts
optional title?: string;
```

Defined in: [packages/sdk/src/editor-service.ts:101](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L101)

Tab title. Defaults to the file's base name.
