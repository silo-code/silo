# Interface: TabHighlightAdornment

Defined in: [packages/sdk/src/tab-adornment.ts:42](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L42)

Soft tinted highlight across the entire CenterDock tab (icon, title, and
every other adornment) — not just the label. Contributing one (via `set`
or a `bind` that returns non-`null`) is itself the on/off signal; there's
no separate boolean. At most one applies per tab — if multiple extensions
contribute one for the same target, the first found wins.

Set via [EditorService.setHighlight](EditorService.md#sethighlight) / [TerminalService.setHighlight](TerminalService.md#sethighlight).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:44](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L44)

Extension-owned key; clear target.

***

### color?

```ts
optional color?: TabAdornmentColor;
```

Defined in: [packages/sdk/src/tab-adornment.ts:46](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L46)

Semantic color for the highlight fill. Defaults to `"accent"`.
