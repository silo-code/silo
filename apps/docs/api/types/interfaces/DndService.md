# Interface: DndService

Defined in: [packages/sdk/src/dnd-service.ts:137](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L137)

The drag-and-drop domain, exposed as [ExtensionContext.dnd](ExtensionContext.md#dnd). Be a drag
source with [DndService.beginDrag](#begindrag) and a drop target with
[DndService.registerDropTarget](#registerdroptarget); payloads are typed via [DND\_MIME](../variables/DND_MIME.md).

## Methods

### beginDrag()

```ts
beginDrag(event, init): void;
```

Defined in: [packages/sdk/src/dnd-service.ts:144](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L144)

Begin a drag from inside a `dragstart` handler: writes the typed
[DragInit.items](DragInit.md#items) onto the native `dataTransfer`, hides the native
drag preview, and starts the floating chip + paste-mode overlay affordance.
Must be called synchronously within the `dragstart` event.

#### Parameters

##### event

`DragEvent` \| `DragEvent`\<`Element`\>

##### init

[`DragInit`](DragInit.md)

#### Returns

`void`

***

### registerDropTarget()

```ts
registerDropTarget(el, handlers): Disposable;
```

Defined in: [packages/sdk/src/dnd-service.ts:150](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L150)

Register `el` as a drop target. The host attaches the drag listeners,
resolves the modifier [DndMode](../type-aliases/DndMode.md), and delivers a [DropContext](DropContext.md).
Returns a [Disposable](Disposable.md) that removes the listeners.

#### Parameters

##### el

`HTMLElement`

##### handlers

[`DropTargetHandlers`](DropTargetHandlers.md)

#### Returns

[`Disposable`](Disposable.md)
