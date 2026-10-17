# Interface: TabIndicatorAdornment

Defined in: [packages/sdk/src/tab-adornment.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L65)

Trailing status adornment on a CenterDock tab — static Phosphor glyph.
For busy/ready/warn/error chrome use [TabActivityAdornment](TabActivityAdornment.md) instead
(ADR 0030).

Set via [EditorService.setIndicator](EditorService.md#setindicator) /
[TerminalService.setIndicator](TerminalService.md#setindicator).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:67](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L67)

Extension-owned key; stacking + clear target.

***

### icon

```ts
icon: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:75](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L75)

Glyph as a [PhosphorIconName](../type-aliases/PhosphorIconName.md) (e.g. `"Flag"`). The host resolves
and paints it at 1em in regular weight by default. Set
[filled](#filled) for Phosphor fill weight;
[color](#color) tints the glyph; set
[chip](#chip) for a soft tinted background.

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:77](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L77)

Tooltip shown when hovering the indicator.

***

### color?

```ts
optional color?: TabAdornmentColor;
```

Defined in: [packages/sdk/src/tab-adornment.ts:79](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L79)

Semantic color for the glyph (and chip fill).

***

### chip?

```ts
optional chip?: boolean;
```

Defined in: [packages/sdk/src/tab-adornment.ts:84](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L84)

When true, paint a soft tinted chip behind the icon. Default is
glyph-only — no background.

***

### filled?

```ts
optional filled?: boolean;
```

Defined in: [packages/sdk/src/tab-adornment.ts:89](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L89)

When true, paint the glyph with Phosphor `weight="fill"`. Default is
regular weight (outline).
