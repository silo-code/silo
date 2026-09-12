# Interface: DockPanelApi

Defined in: [packages/sdk/src/types.ts:79](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L79)

The panel API handed to a [DockPanelKind](DockPanelKind.md) component. Use these methods
to drive the panel's own tab (title, close, focus) and update its stored
parameters. The host provides the implementation; extensions never construct
this object directly.

## Properties

### isActive

```ts
readonly isActive: boolean;
```

Defined in: [packages/sdk/src/types.ts:87](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L87)

`true` while this panel is the active one in its dock group.

***

### isVisible

```ts
readonly isVisible: boolean;
```

Defined in: [packages/sdk/src/types.ts:102](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L102)

`true` while this panel is visible — its tab is the selected one in its
group. Distinct from [isActive](#isactive): with split
groups, every group's selected tab is visible but only one panel in the
whole dock is active.

## Methods

### setTitle()

```ts
setTitle(title): void;
```

Defined in: [packages/sdk/src/types.ts:81](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L81)

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

Defined in: [packages/sdk/src/types.ts:83](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L83)

Programmatically close this panel.

#### Returns

`void`

***

### setActive()

```ts
setActive(): void;
```

Defined in: [packages/sdk/src/types.ts:85](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L85)

Bring this panel to focus (make it the active panel in its group).

#### Returns

`void`

***

### onDidActiveChange()

```ts
onDidActiveChange(listener): Disposable;
```

Defined in: [packages/sdk/src/types.ts:93](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L93)

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

Defined in: [packages/sdk/src/types.ts:109](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L109)

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

Defined in: [packages/sdk/src/types.ts:117](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L117)

Shallow-merge `params` into this panel's stored parameters. Keys absent
from `params` are left unchanged. Useful for keeping tabs-serializable
state (e.g. the open URL in a web-viewer panel) consistent with the UI.

#### Parameters

##### params

`object`

#### Returns

`void`

***

### setTabActivity()

```ts
setTabActivity(adornment): void;
```

Defined in: [packages/sdk/src/types.ts:130](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L130)

Set — or, with `null`, clear — the trailing **activity** badge on this
panel's own tab: the same host-owned [Activity](../type-aliases/Activity.md) chrome
(spinner / ready / warn / error) an editor or terminal tab shows through
[EditorService.setActivity](TabAdornmentMethods.md#setactivity) / [TerminalService.setActivity](TabAdornmentMethods.md#setactivity).

A panel drives its *own* tab, so there is no target id — call it from the
component with whatever state the tab should reflect (a Chat panel mirrors
its Agent Session's activity here, so its tab reads like a terminal tab
running the same agent). The host clears it automatically when the panel
unmounts.

#### Parameters

##### adornment

  \| [`TabActivityContribution`](../type-aliases/TabActivityContribution.md)
  \| `null`

#### Returns

`void`

***

### setTabIcon()

```ts
setTabIcon(adornment): void;
```

Defined in: [packages/sdk/src/types.ts:139](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L139)

Set — or, with `null`, clear — the leading **icon** on this panel's own
tab: the counterpart to [EditorService.setIcon](TabAdornmentMethods.md#seticon) /
[TerminalService.setIcon](TabAdornmentMethods.md#seticon) for a [DockPanelKind](DockPanelKind.md) tab. Use it for
a brand mark (an agent logo, a provider glyph) so the tab is identifiable
at a glance the way a terminal tab running an agent is. Cleared
automatically on unmount.

#### Parameters

##### adornment

[`TabIconContribution`](../type-aliases/TabIconContribution.md) \| `null`

#### Returns

`void`
