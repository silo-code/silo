# Type Alias: SidePanelTabDisplay

```ts
type SidePanelTabDisplay = "icon" | "title" | "both";
```

Defined in: [packages/sdk/src/types.ts:687](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L687)

How a Side Panel's SideDock tab renders itself: the panel's
[SidePanel.icon](../interfaces/SidePanel.md#icon), its [SidePanel.title](../interfaces/SidePanel.md#title), or both.

This is a **user** preference, not a contribution — it is chosen per tab from
the tab's context menu and applies across every workspace. Extensions never
set it; they only offer the icon the user may choose to show.

A panel that registered no icon is always rendered as `"title"`, whatever
value is stored for it.
