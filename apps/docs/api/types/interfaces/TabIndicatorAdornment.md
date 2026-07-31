# Interface: TabIndicatorAdornment

Defined in: [packages/sdk/src/tab-adornment.ts:41](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L41)

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

Defined in: [packages/sdk/src/tab-adornment.ts:43](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L43)

Extension-owned key; stacking + clear target.

***

### icon

```ts
icon: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:51](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L51)

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

Defined in: [packages/sdk/src/tab-adornment.ts:53](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L53)

Tooltip shown when hovering the indicator.

***

### color?

```ts
optional color?: TabAdornmentColor;
```

Defined in: [packages/sdk/src/tab-adornment.ts:55](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L55)

Semantic color for the glyph (and chip fill).

***

### chip?

```ts
optional chip?: boolean;
```

Defined in: [packages/sdk/src/tab-adornment.ts:60](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L60)

When true, paint a soft tinted chip behind the icon. Default is
glyph-only — no background.

***

### filled?

```ts
optional filled?: boolean;
```

Defined in: [packages/sdk/src/tab-adornment.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L65)

When true, paint the glyph with Phosphor `weight="fill"`. Default is
regular weight (outline).
