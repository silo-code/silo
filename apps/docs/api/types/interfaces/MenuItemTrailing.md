# Interface: MenuItemTrailing

Defined in: [packages/sdk/src/ui-service.ts:32](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L32)

A secondary control rendered at the trailing edge of a [MenuItem](MenuItem.md) —
e.g. a delete button on a row whose primary click does something else
(reopen). Its click is isolated: it runs `onClick` and does **not** trigger
the row's [MenuItem.run](MenuItem.md#run).

## Properties

### icon

```ts
icon: ReactNode;
```

Defined in: [packages/sdk/src/ui-service.ts:34](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L34)

The control's glyph (e.g. a Phosphor icon element).

***

### title?

```ts
optional title?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:36](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L36)

Native tooltip for the control.

***

### onClick

```ts
onClick: () => void;
```

Defined in: [packages/sdk/src/ui-service.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L38)

Invoked when the control is clicked; the menu closes first.

#### Returns

`void`
