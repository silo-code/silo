# Interface: TabIndicatorAdornment

Defined in: [packages/sdk/src/tab-adornment.ts:76](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L76)

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

Defined in: [packages/sdk/src/tab-adornment.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L78)

Extension-owned key; stacking + clear target.

***

### icon

```ts
icon: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:86](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L86)

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

Defined in: [packages/sdk/src/tab-adornment.ts:88](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L88)

Tooltip shown when hovering the indicator.

***

### color?

```ts
optional color?: TabAdornmentColor;
```

Defined in: [packages/sdk/src/tab-adornment.ts:90](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L90)

Semantic color for the glyph (and chip fill).

***

### chip?

```ts
optional chip?: boolean;
```

Defined in: [packages/sdk/src/tab-adornment.ts:95](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L95)

When true, paint a soft tinted chip behind the icon. Default is
glyph-only — no background.

***

### filled?

```ts
optional filled?: boolean;
```

Defined in: [packages/sdk/src/tab-adornment.ts:100](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L100)

When true, paint the glyph with Phosphor `weight="fill"`. Default is
regular weight (outline).
