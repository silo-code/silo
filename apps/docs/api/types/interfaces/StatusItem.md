# Interface: StatusItem

Defined in: [packages/sdk/src/types.ts:353](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L353)

A widget in the status bar (the strip along the bottom of the window).

## Remarks

The status bar container sets `font-size` and `color` on itself, so
components rendered inside it inherit the correct values automatically —
**do not override `font-size` or `font-family`** in status item CSS unless
you have a deliberate reason to deviate. You may override `color` using
design tokens (e.g. `--silo-color-text-lo` for a label / `--silo-color-text`
for a value) to create visual distinctions within an item.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:355](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L355)

Unique id for this status item.

***

### alignment

```ts
alignment: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:357](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L357)

Which end of the status bar this item sits at.

***

### priority?

```ts
optional priority?: number;
```

Defined in: [packages/sdk/src/types.ts:359](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L359)

Sort order within its alignment group. Lower sorts first. Defaults to 0.

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/types.ts:367](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L367)

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

Defined in: [packages/sdk/src/types.ts:369](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L369)

The React component (renders its own content; no props).
