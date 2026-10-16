# Interface: ActivePanelInfo

Defined in: [packages/sdk/src/panel-service.ts:16](https://github.com/silo-code/silo/blob/main/packages/sdk/src/panel-service.ts#L16)

A snapshot of the active center-dock panel, when it's a `DockPanelKind`
other than the built-in editor or terminal. Returned by
[PanelService.getState](PanelService.md#getstate) and delivered to
[PanelService.subscribe](PanelService.md#subscribe) listeners.

## Properties

### panelId

```ts
panelId: string;
```

Defined in: [packages/sdk/src/panel-service.ts:19](https://github.com/silo-code/silo/blob/main/packages/sdk/src/panel-service.ts#L19)

The active tab's own dockview id — the same string [PanelService.focus](PanelService.md#focus)
 and the tab-adornment methods take as their target.

***

### kindId

```ts
kindId: string;
```

Defined in: [packages/sdk/src/panel-service.ts:21](https://github.com/silo-code/silo/blob/main/packages/sdk/src/panel-service.ts#L21)

The panel's [DockPanelKind.id](DockPanelKind.md#id).

***

### workspaceId

```ts
workspaceId: string;
```

Defined in: [packages/sdk/src/panel-service.ts:23](https://github.com/silo-code/silo/blob/main/packages/sdk/src/panel-service.ts#L23)

The workspace whose dock this panel is active in.

***

### recordId?

```ts
optional recordId?: string;
```

Defined in: [packages/sdk/src/panel-service.ts:29](https://github.com/silo-code/silo/blob/main/packages/sdk/src/panel-service.ts#L29)

This tab's [DockPanelRecord.id](DockPanelRecord.md#id), when the kind is
`persistence: "recorded"` — the same id [Workspace.panels](Workspace.md#panels)
enumerates. `undefined` for a transient kind (no record exists to name).
