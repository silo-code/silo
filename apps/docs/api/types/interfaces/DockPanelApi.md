# Interface: DockPanelApi

Defined in: [packages/sdk/src/types.ts:64](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L64)

The panel API handed to a [DockPanelKind](DockPanelKind.md) component. Use these methods
to drive the panel's own tab (title, close, focus) and update its stored
parameters. The host provides the implementation; extensions never construct
this object directly.

## Properties

### isActive

```ts
readonly isActive: boolean;
```

Defined in: [packages/sdk/src/types.ts:72](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L72)

`true` while this panel is the active one in its dock group.

***

### isVisible

```ts
readonly isVisible: boolean;
```

Defined in: [packages/sdk/src/types.ts:87](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L87)

`true` while this panel is visible — its tab is the selected one in its
group. Distinct from [isActive](#isactive): with split
groups, every group's selected tab is visible but only one panel in the
whole dock is active.

## Methods

### setTitle()

```ts
setTitle(title): void;
```

Defined in: [packages/sdk/src/types.ts:66](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L66)

Update the title shown in the panel's tab.

#### Parameters

##### title

`string`

#### Returns

`void`

***

### close()

```ts
close(): void;
```

Defined in: [packages/sdk/src/types.ts:68](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L68)

Programmatically close this panel.

#### Returns

`void`

***

### setActive()

```ts
setActive(): void;
```

Defined in: [packages/sdk/src/types.ts:70](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L70)

Bring this panel to focus (make it the active panel in its group).

#### Returns

`void`

***

### onDidActiveChange()

```ts
onDidActiveChange(listener): Disposable;
```

Defined in: [packages/sdk/src/types.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L78)

Subscribe to active-state transitions. The listener is called whenever
the panel gains or loses active status, with an event carrying the new
state. Returns a [Disposable](Disposable.md) that cancels the subscription.

#### Parameters

##### listener

(`event`) => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### onDidVisibilityChange()

```ts
onDidVisibilityChange(listener): Disposable;
```

Defined in: [packages/sdk/src/types.ts:94](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L94)

Subscribe to visibility transitions (the panel's tab being selected or
deselected in its group). Use to pause expensive work while hidden, or to
re-measure on reveal (e.g. the terminal refits xterm when its tab becomes
visible again). Returns a [Disposable](Disposable.md) that cancels the subscription.

#### Parameters

##### listener

(`event`) => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### updateParameters()

```ts
updateParameters(params): void;
```

Defined in: [packages/sdk/src/types.ts:102](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L102)

Shallow-merge `params` into this panel's stored parameters. Keys absent
from `params` are left unchanged. Useful for keeping tabs-serializable
state (e.g. the open URL in a web-viewer panel) consistent with the UI.

#### Parameters

##### params

`object`

#### Returns

`void`
