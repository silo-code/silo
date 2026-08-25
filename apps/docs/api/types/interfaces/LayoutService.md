# Interface: LayoutService

Defined in: [packages/sdk/src/layout-service.ts:68](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L68)

Consumer API for app layout, exposed as [ExtensionContext.layout](ExtensionContext.md#layout).
Read side-panel collapse state and drive it.

## Methods

### getState()

```ts
getState(): LayoutState;
```

Defined in: [packages/sdk/src/layout-service.ts:70](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L70)

Current frozen layout state.

#### Returns

[`LayoutState`](LayoutState.md)

***

### subscribe()

```ts
subscribe(listener): Disposable;
```

Defined in: [packages/sdk/src/layout-service.ts:72](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L72)

Subscribe to layout changes; dispose to stop.

#### Parameters

##### listener

(`s`) => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### toggleSidePanel()

```ts
toggleSidePanel(location): void;
```

Defined in: [packages/sdk/src/layout-service.ts:74](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L74)

Toggle a side column between collapsed and expanded.

#### Parameters

##### location

[`SideLocation`](../type-aliases/SideLocation.md)

#### Returns

`void`

***

### setSidePanelCollapsed()

```ts
setSidePanelCollapsed(location, collapsed): void;
```

Defined in: [packages/sdk/src/layout-service.ts:76](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L76)

Set a side column's collapsed state explicitly.

#### Parameters

##### location

[`SideLocation`](../type-aliases/SideLocation.md)

##### collapsed

`boolean`

#### Returns

`void`

***

### revealSidePanel()

```ts
revealSidePanel(id): void;
```

Defined in: [packages/sdk/src/layout-service.ts:83](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L83)

Reveal a registered side panel by its [SidePanel.id](SidePanel.md#id): make it the
active panel in its column and expand that column if collapsed. Use to bring
a panel to the foreground from a command or keybinding (e.g. "Find in Files"
focusing the Search panel). No-op if no panel with that id is registered.

#### Parameters

##### id

`string`

#### Returns

`void`

***

### openPanelSheet()

```ts
openPanelSheet(
   panelId, 
   render, 
opts?): Promise<void>;
```

Defined in: [packages/sdk/src/layout-service.ts:113](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L113)

Open a host-owned sheet that grows out of the side dock currently hosting
`panelId` — reveals that panel first (the same unhide + activate-tab +
expand-column work [LayoutService.revealSidePanel](#revealsidepanel) does), then
slides a sheet out from its side. Never modal: no scrim, `Escape` does
nothing, the rest of the workbench stays live and interactive.

Like [LayoutService.revealSidePanel](#revealsidepanel), `panelId` isn't restricted to
a panel the calling extension itself registered — a status-bar button or
command from one extension can open a companion sheet for another's panel.

Supply a `render` callback that receives a `close` function and returns
the sheet's content; the returned promise resolves (with no value) once
the sheet closes. Rejects if `panelId` names no registered
[SidePanel](SidePanel.md).

#### Parameters

##### panelId

`string`

The [SidePanel.id](SidePanel.md#id) to anchor and reveal.

##### render

(`close`) => `ReactNode`

Returns the sheet's content; receives `close` to settle it.

##### opts?

[`SheetOptions`](SheetOptions.md)

Presentation options — see [SheetOptions](SheetOptions.md).

#### Returns

`Promise`\<`void`\>

#### Example

```tsx
void ctx.layout.openPanelSheet(
  "skills",
  (close) => <BrowseBody onClose={close} />,
  { title: <BrandMark />, width: 560 },
);
```

***

### openPanel()

```ts
openPanel(
   kindId, 
   params?, 
   options?): void;
```

Defined in: [packages/sdk/src/layout-service.ts:135](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L135)

Open a new tab in the center dock for the given registered
[DockPanelKind](DockPanelKind.md). Use this to programmatically open a custom panel
kind from a command (e.g. a "Web Viewer: Open" command that creates a new
web-viewer tab). No-op when the center dock has no active workspace.

#### Parameters

##### kindId

`string`

The [DockPanelKind.id](DockPanelKind.md#id) to instantiate.

##### params?

`Record`\<`string`, `unknown`\>

Arbitrary params forwarded to the panel component.
  Serialized into `ws.dockLayout` so state survives workspace
  close/reopen.

##### options?

`singleton: true` opens at most one instance at a time:
  if a panel with `kindId` already exists, it is focused instead of
  creating a new one — `params` is still shallow-merged into that
  existing panel first, so a later call can retarget it (e.g. switching
  which channel the Output panel shows). The panel's id equals `kindId`
  (not UUID-based) when singleton is set.

###### singleton?

`boolean`

#### Returns

`void`

***

### ~~openSingletonPanel()~~

```ts
openSingletonPanel(kindId, params?): void;
```

Defined in: [packages/sdk/src/layout-service.ts:145](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L145)

Open a **singleton** dock panel.

#### Parameters

##### kindId

`string`

##### params?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Deprecated

Use `openPanel(kindId, params, { singleton: true })` instead.
  This method will be removed in a future release.
