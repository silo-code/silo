# Interface: ShowMenuOptions

Defined in: [packages/sdk/src/ui-service.ts:246](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L246)

Options for [UiService.showMenu](UiService.md#showmenu). Position resolves in the order
`anchor` → `at` → the current cursor (so `showMenu({ items })` with no
position opens at the mouse, which is what a right-click handler wants).

## Properties

### items

```ts
items: MenuEntry[];
```

Defined in: [packages/sdk/src/ui-service.ts:248](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L248)

The rows to show, top to bottom.

***

### at?

```ts
optional at?: object;
```

Defined in: [packages/sdk/src/ui-service.ts:250](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L250)

Explicit viewport point — e.g. a right-click's `clientX`/`clientY`.

#### x

```ts
x: number;
```

#### y

```ts
y: number;
```

***

### anchor?

```ts
optional anchor?: HTMLElement | null;
```

Defined in: [packages/sdk/src/ui-service.ts:252](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L252)

Anchor element to hang the menu off (for a button dropdown).

***

### align?

```ts
optional align?: "start" | "end";
```

Defined in: [packages/sdk/src/ui-service.ts:254](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L254)

Align the menu to the anchor's left (`"start"`, default) or right (`"end"`).

***

### toggle?

```ts
optional toggle?: boolean;
```

Defined in: [packages/sdk/src/ui-service.ts:262](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L262)

Toggle an anchored dropdown. When `true` (the default), calling `showMenu`
again with the **same `anchor`** while that menu is still open closes it
instead of reopening — so a second click on the button dismisses its
dropdown. Set `false` to keep the legacy always-(re)open behaviour. Has no
effect without an `anchor` (cursor / `at` menus always open).
