# Interface: DropContext

Defined in: [packages/sdk/src/dnd-service.ts:77](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L77)

Context delivered to a [DropTargetHandlers](DropTargetHandlers.md) callback for a drag over or
drop on a registered target.

## Properties

### items

```ts
items: DndItem[];
```

Defined in: [packages/sdk/src/dnd-service.ts:84](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L84)

Typed items read from the native `dataTransfer`. Populated on `drop`;
during `dragover` the browser exposes only MIME *types* (not values), so
this may be empty there — branch on [DropContext.mode](#mode) / the target's
`accepts` instead.

***

### mode

```ts
mode: DndMode;
```

Defined in: [packages/sdk/src/dnd-service.ts:86](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L86)

The resolved modifier mode (Shift ⇒ `"paste"`).

***

### clientX

```ts
clientX: number;
```

Defined in: [packages/sdk/src/dnd-service.ts:88](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L88)

Pointer X in client coordinates.

***

### clientY

```ts
clientY: number;
```

Defined in: [packages/sdk/src/dnd-service.ts:90](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L90)

Pointer Y in client coordinates.

***

### nativeEvent

```ts
nativeEvent: DragEvent;
```

Defined in: [packages/sdk/src/dnd-service.ts:92](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L92)

The underlying native event (escape hatch for advanced callers).
