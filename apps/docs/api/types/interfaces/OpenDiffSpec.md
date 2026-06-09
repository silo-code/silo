# Interface: OpenDiffSpec

Defined in: [packages/sdk/src/editor-service.ts:75](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L75)

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

Defined in: [packages/sdk/src/editor-service.ts:77](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L77)

The file the diff is OF — drives language detection, breadcrumb, title.

***

### providerId

```ts
providerId: string;
```

Defined in: [packages/sdk/src/editor-service.ts:79](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L79)

Id of the registered content provider that resolves the two sides.

***

### args?

```ts
optional args?: Record<string, unknown>;
```

Defined in: [packages/sdk/src/editor-service.ts:81](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L81)

Serializable args handed back to the provider to (re)compute content.

***

### title?

```ts
optional title?: string;
```

Defined in: [packages/sdk/src/editor-service.ts:83](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L83)

Tab title. Defaults to the file's base name.
