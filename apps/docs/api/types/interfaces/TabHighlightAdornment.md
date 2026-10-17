# Interface: TabHighlightAdornment

Defined in: [packages/sdk/src/tab-adornment.ts:47](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L47)

Soft tinted highlight on a CenterDock tab: the semantic color falls from
the tab's top edge and fades out before the bottom, and the title takes
the same color. The leading [icon](TabIconAdornment.md) and the
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

Defined in: [packages/sdk/src/tab-adornment.ts:49](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L49)

Extension-owned key; clear target.

***

### color?

```ts
optional color?: TabAdornmentColor;
```

Defined in: [packages/sdk/src/tab-adornment.ts:51](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L51)

Semantic color for the highlight. Defaults to `"accent"`.
