# ~~Type Alias: SidePanelSlot~~

```ts
type SidePanelSlot = "left" | "right" | "left-bottom" | "right-bottom";
```

Defined in: [packages/sdk/src/domain-types.ts:123](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L123)

The four fixed slots a side dock used to divide into.

## Deprecated

A side dock is now a layout tree of freely-arranged panes, and a
panel's placement is recorded against an **opaque pane id** rather than one
of these values (RFC 0027). The four strings below are still valid pane ids —
they are what an existing workspace's panes are named — but they are no
longer the whole set, and nothing may infer a position or a dock from one.

Nothing on `ctx` accepts or returns this type; a panel declares only which
dock it wants, via [SidePanel.location](../interfaces/SidePanel.md#location). It remains exported so an
extension that referenced it keeps compiling.
