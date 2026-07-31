# Type Alias: DiffContentProvider

```ts
type DiffContentProvider = (request) => Promise<DiffContent>;
```

Defined in: [packages/sdk/src/editor-service.ts:152](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L152)

Resolves the two sides of a diff on demand — called by the host whenever a
diff panel mounts (open, tab switch, app restart), so content stays a pure
computed view and never has to be persisted. Register one with
[EditorService.registerDiffContentProvider](../interfaces/EditorService.md#registerdiffcontentprovider).

## Parameters

### request

[`DiffContentRequest`](../interfaces/DiffContentRequest.md)

## Returns

`Promise`\<[`DiffContent`](../interfaces/DiffContent.md)\>
