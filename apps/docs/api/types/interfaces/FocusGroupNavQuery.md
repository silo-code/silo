# Interface: FocusGroupNavQuery

Defined in: [packages/sdk/src/use-focus-group.ts:138](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L138)

A roving-navigation query for [focusGroupNextIndex](../functions/focusGroupNextIndex.md).

## Properties

### current

```ts
current: number;
```

Defined in: [packages/sdk/src/use-focus-group.ts:140](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L140)

The index focus is on now.

***

### count

```ts
count: number;
```

Defined in: [packages/sdk/src/use-focus-group.ts:142](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L142)

Number of items.

***

### key

```ts
key: string;
```

Defined in: [packages/sdk/src/use-focus-group.ts:144](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L144)

The pressed key (`ArrowDown`/`ArrowUp`/`ArrowLeft`/`ArrowRight`/`Home`/`End`).

***

### orientation

```ts
orientation: FocusGroupOrientation;
```

Defined in: [packages/sdk/src/use-focus-group.ts:146](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L146)

Which arrows navigate.

***

### wrap

```ts
wrap: boolean;
```

Defined in: [packages/sdk/src/use-focus-group.ts:148](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L148)

Wrap past the ends vs. stop.

***

### isNavigable

```ts
isNavigable: (index) => boolean;
```

Defined in: [packages/sdk/src/use-focus-group.ts:150](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L150)

Which indices accept focus; others are skipped.

#### Parameters

##### index

`number`

#### Returns

`boolean`
