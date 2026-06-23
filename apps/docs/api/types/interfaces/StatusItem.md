# Interface: StatusItem

Defined in: [packages/sdk/src/types.ts:344](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L344)

A widget in the status bar (the strip along the bottom of the window).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:346](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L346)

Unique id for this status item.

***

### alignment

```ts
alignment: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:348](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L348)

Which end of the status bar this item sits at.

***

### priority?

```ts
optional priority?: number;
```

Defined in: [packages/sdk/src/types.ts:350](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L350)

Sort order within its alignment group. Lower sorts first. Defaults to 0.

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/types.ts:358](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L358)

Tooltip shown on hover over the entire status item. The host renders a
custom-styled popup (not the browser's native `title` tooltip). For items
that need per-button or reactive tooltips, omit this and manage tooltips
inside the component instead (core extensions use `<Tooltip>` from the
internal barrel; external extensions may use the native `title` attribute).

***

### component

```ts
component: ComponentType;
```

Defined in: [packages/sdk/src/types.ts:360](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L360)

The React component (renders its own content; no props).
