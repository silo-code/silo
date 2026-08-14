# Interface: StatusItem

Defined in: [packages/sdk/src/types.ts:591](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L591)

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

Defined in: [packages/sdk/src/types.ts:593](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L593)

Unique id for this status item.

***

### alignment

```ts
alignment: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:595](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L595)

Which end of the status bar this item sits at.

***

### priority?

```ts
optional priority?: number;
```

Defined in: [packages/sdk/src/types.ts:609](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L609)

Sort order within its alignment group. Defaults to 0.

The sort direction mirrors the alignment so that **negative values always
anchor an item toward the nearest edge**:
- **Left items** sort ascending — lower priority = closer to the left edge.
- **Right items** sort descending — lower priority = closer to the right edge.

**Convention:** built-in (core) items use negative values so they are
anchored to their respective edges. Extensions should use `0` or greater,
which places them between the two built-in zones by default. An extension
may still choose a negative value intentionally to interleave with built-ins.

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/types.ts:617](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L617)

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

Defined in: [packages/sdk/src/types.ts:619](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L619)

The React component (renders its own content; no props).
