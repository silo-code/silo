# Interface: LayoutService

Defined in: [packages/sdk/src/layout-service.ts:40](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L40)

Consumer API for app layout, exposed as [ExtensionContext.layout](ExtensionContext.md#layout).
Read side-panel collapse state and drive it.

## Methods

### getState()

```ts
getState(): LayoutState;
```

Defined in: [packages/sdk/src/layout-service.ts:42](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L42)

Current frozen layout state.

#### Returns

[`LayoutState`](LayoutState.md)

***

### subscribe()

```ts
subscribe(listener): Disposable;
```

Defined in: [packages/sdk/src/layout-service.ts:44](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L44)

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

Defined in: [packages/sdk/src/layout-service.ts:46](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L46)

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

Defined in: [packages/sdk/src/layout-service.ts:48](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L48)

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

Defined in: [packages/sdk/src/layout-service.ts:55](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L55)

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

### openPanel()

```ts
openPanel(
   kindId, 
   params?, 
   options?): void;
```

Defined in: [packages/sdk/src/layout-service.ts:71](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L71)

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
  creating a new one. The panel's id equals `kindId` (not UUID-based) when
  singleton is set.

###### singleton?

`boolean`

#### Returns

`void`

***

### ~~openSingletonPanel()~~

```ts
openSingletonPanel(kindId, params?): void;
```

Defined in: [packages/sdk/src/layout-service.ts:81](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L81)

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
