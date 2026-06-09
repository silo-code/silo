# Interface: DndItem

Defined in: [packages/sdk/src/dnd-service.ts:36](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L36)

One typed item carried by a drag — a MIME type plus its string payload.

## Properties

### mime

```ts
mime: string;
```

Defined in: [packages/sdk/src/dnd-service.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L38)

The item's MIME type; use a [DND\_MIME](../variables/DND_MIME.md) constant for interop.

***

### value

```ts
value: string;
```

Defined in: [packages/sdk/src/dnd-service.ts:40](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L40)

The string payload (e.g. an absolute path for [DND\_MIME.filePath](../variables/DND_MIME.md#filepath)).
