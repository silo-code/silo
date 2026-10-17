# Type Alias: TabAdornmentColor

```ts
type TabAdornmentColor = "accent" | "info" | "warn" | "ok" | "error" | "muted";
```

Defined in: [packages/sdk/src/tab-adornment.ts:18](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L18)

Semantic color for a CenterDock tab trailing [TabIndicatorAdornment](../interfaces/TabIndicatorAdornment.md)
(and optional chip background) or [TabHighlightAdornment](../interfaces/TabHighlightAdornment.md).

`"info"` is the themeable blue — for "informational / in progress" flags.
It is not the pinned [Activity](Activity.md) `working` blue: activity colors stay
outside the theme-preset system on purpose (ADR 0030), so the two look
alike but never share a token.
