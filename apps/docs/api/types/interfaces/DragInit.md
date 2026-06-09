# Interface: DragInit

Defined in: [packages/sdk/src/dnd-service.ts:50](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L50)

What a drag carries and how its chip should read, passed to
[DndService.beginDrag](DndService.md#begindrag).

## Properties

### items

```ts
items: DndItem[];
```

Defined in: [packages/sdk/src/dnd-service.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L52)

Typed payload items written onto the native `dataTransfer`.

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/dnd-service.ts:54](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L54)

Label shown in the floating drag chip (e.g. the file name).

***

### effect?

```ts
optional effect?: "copy" | "move" | "copyMove";
```

Defined in: [packages/sdk/src/dnd-service.ts:56](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L56)

`dataTransfer.effectAllowed`; defaults to `"copyMove"`.
