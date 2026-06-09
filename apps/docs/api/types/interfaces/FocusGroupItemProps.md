# Interface: FocusGroupItemProps

Defined in: [packages/sdk/src/use-focus-group.ts:80](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L80)

Props [useFocusGroup](../functions/useFocusGroup.md) returns per item — spread onto item `index`. They
carry the single-tab-stop `tabIndex`, the key/focus handlers, and the
`data-focus-*` markers the host's CSS styles into the keyboard ring. Your own
`role`/`aria-*`/`onClick`/`className` sit alongside them.

## Properties

### tabIndex

```ts
tabIndex: number;
```

Defined in: [packages/sdk/src/use-focus-group.ts:81](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L81)

***

### ref

```ts
ref: (el) => void;
```

Defined in: [packages/sdk/src/use-focus-group.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L82)

#### Parameters

##### el

`HTMLElement` \| `null`

#### Returns

`void`

***

### onKeyDown

```ts
onKeyDown: (e) => void;
```

Defined in: [packages/sdk/src/use-focus-group.ts:83](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L83)

#### Parameters

##### e

`KeyboardEvent`

#### Returns

`void`

***

### onFocus

```ts
onFocus: () => void;
```

Defined in: [packages/sdk/src/use-focus-group.ts:84](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L84)

#### Returns

`void`

***

### onPointerDown

```ts
onPointerDown: (e) => void;
```

Defined in: [packages/sdk/src/use-focus-group.ts:85](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L85)

#### Parameters

##### e

`PointerEvent`

#### Returns

`void`

***

### data-focus-item

```ts
data-focus-item: "";
```

Defined in: [packages/sdk/src/use-focus-group.ts:87](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L87)

Marks every group item, so the host can reset the native focus outline.

***

### data-focus-visible?

```ts
optional data-focus-visible?: "";
```

Defined in: [packages/sdk/src/use-focus-group.ts:92](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L92)

Present on the active item only while focus is keyboard-driven — the host's
CSS keys the ring on it. Absent for pointer focus, matching `:focus-visible`.
