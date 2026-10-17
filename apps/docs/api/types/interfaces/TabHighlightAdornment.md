# Interface: TabHighlightAdornment

Defined in: [packages/sdk/src/tab-adornment.ts:58](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L58)

Soft tinted highlight on a CenterDock tab: a rounded chip in the semantic
color, inset from every tab edge so the tab's own shape still reads, and
the title takes the same color. The leading [icon](TabIconAdornment.md) and the
trailing [indicator](TabIndicatorAdornment.md) keep their own colors,
so an indicator stays free to disagree with the highlight.

Contributing one (via `set` or a `bind` that returns non-`null`) is itself
the on/off signal; there's no separate boolean. At most one applies per
tab — if multiple extensions contribute one for the same target, the first
found wins.

Set via [EditorService.setHighlight](EditorService.md#sethighlight) / [TerminalService.setHighlight](TerminalService.md#sethighlight).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:60](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L60)

Extension-owned key; clear target.

***

### color?

```ts
optional color?: TabAdornmentColor;
```

Defined in: [packages/sdk/src/tab-adornment.ts:62](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L62)

Semantic color for the highlight. Defaults to `"accent"`.
