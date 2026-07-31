# Type Alias: Activity

```ts
type Activity = "working" | "ready" | "warn" | "error";
```

Defined in: [packages/sdk/src/activity.ts:11](https://github.com/silo-code/silo/blob/main/packages/sdk/src/activity.ts#L11)

Host-owned activity state for chrome (workspace rows, CenterDock tabs,
SideDock tabs, and the public Activity glyph). Extensions pick a
kind only — never an icon, color, or motion. See ADR 0030.
