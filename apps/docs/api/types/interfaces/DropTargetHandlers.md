# Interface: DropTargetHandlers

Defined in: [packages/sdk/src/dnd-service.ts:101](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L101)

Handlers for a target registered via [DndService.registerDropTarget](DndService.md#registerdroptarget).

## Properties

### accepts

```ts
accepts: string[];
```

Defined in: [packages/sdk/src/dnd-service.ts:103](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L103)

MIME types this target consumes; a drag is accepted if it carries one.

***

### capture?

```ts
optional capture?: boolean;
```

Defined in: [packages/sdk/src/dnd-service.ts:126](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L126)

Attach listeners in the capture phase so this target intercepts before
bubble-phase handlers (e.g. the center dock). Defaults to `false`.

## Methods

### onDrop()

```ts
onDrop(ctx): boolean | void;
```

Defined in: [packages/sdk/src/dnd-service.ts:109](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L109)

Called on a matching drop. Return `true` if you handled it — the host then
calls `preventDefault()` + `stopPropagation()` so the drop does **not**
fall through to other targets (e.g. the center dock opening a new pane).

#### Parameters

##### ctx

[`DropContext`](DropContext.md)

#### Returns

`boolean` \| `void`

***

### onDragOver()?

```ts
optional onDragOver(ctx): void | "none" | "copy" | "move";
```

Defined in: [packages/sdk/src/dnd-service.ts:115](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L115)

Optional: called on each accepted drag-over (drive hover styling). Return a
drop effect to set the cursor, or nothing to leave it. The host already
calls `preventDefault()` so the drop is allowed.

#### Parameters

##### ctx

[`DropContext`](DropContext.md)

#### Returns

`void` \| `"none"` \| `"copy"` \| `"move"`

***

### onDragLeave()?

```ts
optional onDragLeave(e): void;
```

Defined in: [packages/sdk/src/dnd-service.ts:121](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L121)

Optional: the pointer left the target (clear hover styling). Receives the
native event so callers can ignore leaves into a descendant
(`el.contains(e.relatedTarget)`).

#### Parameters

##### e

`DragEvent`

#### Returns

`void`
