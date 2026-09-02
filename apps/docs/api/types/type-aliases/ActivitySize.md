# Type Alias: ActivitySize

```ts
type ActivitySize = "sm" | "md";
```

Defined in: [packages/sdk/src/activity.ts:23](https://github.com/silo-code/silo/blob/main/packages/sdk/src/activity.ts#L23)

Glyph size for [Activity](Activity.md). `"sm"` (8px at the default `uiFontSize`) is
the workbench size — workspace status rows and CenterDock / SideDock tabs;
`"md"` (10px) is the roomier one, for a list that leads with the dot rather
than tucking it into chrome. Both scale with `uiFontSize` rather than being
fixed pixels.
