# Interface: FocusGroup

Defined in: [packages/sdk/src/use-focus-group.ts:101](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L101)

The headless focus-group controller [useFocusGroup](../functions/useFocusGroup.md) returns.

## Properties

### containerProps

```ts
containerProps: FocusGroupContainerProps;
```

Defined in: [packages/sdk/src/use-focus-group.ts:103](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L103)

Spread on the group container.

***

### getItemProps

```ts
getItemProps: (index) => FocusGroupItemProps;
```

Defined in: [packages/sdk/src/use-focus-group.ts:105](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L105)

Spread on item `index`.

#### Parameters

##### index

`number`

#### Returns

[`FocusGroupItemProps`](FocusGroupItemProps.md)

***

### activeIndex

```ts
activeIndex: number;
```

Defined in: [packages/sdk/src/use-focus-group.ts:107](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L107)

The item that currently holds (or, when unfocused, would receive) focus.

***

### focusItem

```ts
focusItem: (index) => void;
```

Defined in: [packages/sdk/src/use-focus-group.ts:109](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L109)

Imperatively move focus to an item (e.g. `↓` from a search box into a list).

#### Parameters

##### index

`number`

#### Returns

`void`
