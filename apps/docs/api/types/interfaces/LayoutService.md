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
