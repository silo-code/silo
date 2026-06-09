# Interface: FocusGroupOptions

Defined in: [packages/sdk/src/use-focus-group.ts:32](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L32)

Options for [useFocusGroup](../functions/useFocusGroup.md). Describe the set of peer items and what
`Enter`/the context-menu key should do; the hook owns the rest (single tab
stop, arrow/Home/End movement, the keyboard-only ring).

## Properties

### count

```ts
count: number;
```

Defined in: [packages/sdk/src/use-focus-group.ts:34](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L34)

Number of items in the group.

***

### start?

```ts
optional start?: number;
```

Defined in: [packages/sdk/src/use-focus-group.ts:41](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L41)

The index focus enters on (the host's "first tabbable" lands here, e.g. the
selected row). Re-parked here whenever the group doesn't hold focus, so a
fresh entry always starts on it. Default `0`. Skipped to the nearest
navigable index if [isNavigable](#isnavigable) rejects it.

***

### orientation?

```ts
optional orientation?: FocusGroupOrientation;
```

Defined in: [packages/sdk/src/use-focus-group.ts:43](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L43)

Arrow-key axis. Default `"vertical"`.

***

### wrap?

```ts
optional wrap?: boolean;
```

Defined in: [packages/sdk/src/use-focus-group.ts:45](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L45)

Wrap past the ends (default `true`) vs. stop at the first/last item.

***

### isNavigable?

```ts
optional isNavigable?: (index) => boolean;
```

Defined in: [packages/sdk/src/use-focus-group.ts:50](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L50)

Which indices accept focus; others (separators, headers, disabled rows) are
skipped by the arrows, Home/End, and the entry point. Default: all navigable.

#### Parameters

##### index

`number`

#### Returns

`boolean`

***

### onActivate?

```ts
optional onActivate?: (index) => void;
```

Defined in: [packages/sdk/src/use-focus-group.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L52)

`Enter`/`Space` on an item.

#### Parameters

##### index

`number`

#### Returns

`void`

***

### onMenu?

```ts
optional onMenu?: (index, anchor) => void;
```

Defined in: [packages/sdk/src/use-focus-group.ts:57](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L57)

The context-menu key / `Shift`+`F10` on an item; `anchor` is the item's DOM
element, so a menu can be positioned against the row.

#### Parameters

##### index

`number`

##### anchor

`HTMLElement`

#### Returns

`void`
