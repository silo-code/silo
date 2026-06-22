# Type Alias: DockPanelApi

```ts
type DockPanelApi = IDockviewPanelProps["api"];
```

Defined in: [packages/sdk/src/types.ts:58](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L58)

The dockview panel API handed to a [DockPanelKind](../interfaces/DockPanelKind.md) component — used to
drive the panel's own tab (title, close, focus). Re-exported from `dockview`
so extensions don't take a direct dependency on it.
