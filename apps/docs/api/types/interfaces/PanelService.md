# Interface: PanelService

Defined in: [packages/sdk/src/panel-service.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/panel-service.ts#L52)

Tab-chrome verbs for a dock panel tab of any [DockPanelKind](DockPanelKind.md) — the
bundled Chat transcript, a web viewer, a third-party panel. Target id is
the panel's own dockview id — the same string a `"panel/tab"` context-menu
hit or a `"panel"` toolbar hit carries as `panelId`.

Parallel to [EditorService](EditorService.md) / [TerminalService](TerminalService.md), which offer
the same [TabAdornmentMethods](TabAdornmentMethods.md) scoped to their own kind — a panel tab
is a first-class third citizen for icon/highlight/indicator/activity
chrome, not a special case extensions have to work around.

To enumerate a workspace's recorded panels rather than adorn one you were
already handed, read [Workspace.panels](Workspace.md#panels) and take each entry's
[DockPanelRecord.panelId](DockPanelRecord.md#panelid) — that field is the id these methods want.
Don't compose it from [DockPanelRecord.id](DockPanelRecord.md#id) and
[DockPanelRecord.kindId](DockPanelRecord.md#kindid): the format is host-owned and may change.

## Extends

- [`TabAdornmentMethods`](TabAdornmentMethods.md)

## Methods

### focus()

```ts
focus(panelId): void;
```

Defined in: [packages/sdk/src/panel-service.ts:64](https://github.com/silo-code/silo/blob/main/packages/sdk/src/panel-service.ts#L64)

Switch to the panel's owning workspace and bring its dock tab to the
front. No-op if `panelId` names no open panel.

#### Parameters

##### panelId

`string`

#### Returns

`void`

#### Example

```ts
for (const p of workspace.panels) {
  if (p.id === flaggedRecordId) ctx.panels.focus(p.panelId);
}
```

***

### getState()

```ts
getState(): ActivePanelInfo | null;
```

Defined in: [packages/sdk/src/panel-service.ts:84](https://github.com/silo-code/silo/blob/main/packages/sdk/src/panel-service.ts#L84)

Current frozen snapshot of the active panel — `null` whenever the active
center-dock tab is the built-in editor or terminal, or nothing. Mirrors
[EditorService.getState](EditorService.md#getstate): referentially stable between renders, so
`useServiceState(ctx.panels)` works without extra memoization.

A consumer that needs "is *this* flagged panel the one on screen"
compares `recordId` (or `panelId`) against its own records — e.g. each
entry's [DockPanelRecord.id](DockPanelRecord.md#id) from [Workspace.panels](Workspace.md#panels).

#### Returns

[`ActivePanelInfo`](ActivePanelInfo.md) \| `null`

#### Example

```ts
const active = ctx.panels.getState();
if (active?.kindId === "silo.agents-chat-panel") {
  ctx.log.info(`Looking at panel ${active.panelId}`);
}
```

***

### subscribe()

```ts
subscribe(listener): Disposable;
```

Defined in: [packages/sdk/src/panel-service.ts:95](https://github.com/silo-code/silo/blob/main/packages/sdk/src/panel-service.ts#L95)

Subscribe to changes in the active panel. The listener is called whenever
[PanelService.getState](#getstate)'s value changes (tab focus moves, workspace
switches, or the active tab becomes/stops being a non-editor/terminal
panel). Returns a [Disposable](Disposable.md) that cancels the subscription.

Use `useServiceState(ctx.panels)` in React components instead of calling
`subscribe` directly.

#### Parameters

##### listener

(`state`) => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### setIcon()

```ts
setIcon(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:245](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L245)

#### Parameters

##### targetId

`string`

##### adornment

[`TabIconAdornment`](TabIconAdornment.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`setIcon`](TabAdornmentMethods.md#seticon)

***

### clearIcon()

```ts
clearIcon(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:246](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L246)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`clearIcon`](TabAdornmentMethods.md#clearicon)

***

### bindIcon()

```ts
bindIcon(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:247](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L247)

#### Parameters

##### binder

[`TabIconBinder`](TabIconBinder.md)

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`bindIcon`](TabAdornmentMethods.md#bindicon)

***

### setHighlight()

```ts
setHighlight(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:249](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L249)

#### Parameters

##### targetId

`string`

##### adornment

[`TabHighlightAdornment`](TabHighlightAdornment.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`setHighlight`](TabAdornmentMethods.md#sethighlight)

***

### clearHighlight()

```ts
clearHighlight(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:250](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L250)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`clearHighlight`](TabAdornmentMethods.md#clearhighlight)

***

### bindHighlight()

```ts
bindHighlight(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:251](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L251)

#### Parameters

##### binder

[`TabHighlightBinder`](TabHighlightBinder.md)

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`bindHighlight`](TabAdornmentMethods.md#bindhighlight)

***

### setIndicator()

```ts
setIndicator(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:253](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L253)

#### Parameters

##### targetId

`string`

##### adornment

[`TabIndicatorAdornment`](TabIndicatorAdornment.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`setIndicator`](TabAdornmentMethods.md#setindicator)

***

### clearIndicator()

```ts
clearIndicator(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:254](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L254)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`clearIndicator`](TabAdornmentMethods.md#clearindicator)

***

### flashIndicator()

```ts
flashIndicator(targetId, flash): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:255](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L255)

#### Parameters

##### targetId

`string`

##### flash

[`TabIndicatorFlash`](../type-aliases/TabIndicatorFlash.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`flashIndicator`](TabAdornmentMethods.md#flashindicator)

***

### bindIndicator()

```ts
bindIndicator(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:256](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L256)

#### Parameters

##### binder

[`TabIndicatorBinder`](TabIndicatorBinder.md)

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`bindIndicator`](TabAdornmentMethods.md#bindindicator)

***

### setActivity()

```ts
setActivity(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:258](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L258)

#### Parameters

##### targetId

`string`

##### adornment

[`TabActivityAdornment`](TabActivityAdornment.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`setActivity`](TabAdornmentMethods.md#setactivity)

***

### clearActivity()

```ts
clearActivity(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:259](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L259)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`clearActivity`](TabAdornmentMethods.md#clearactivity)

***

### flashActivity()

```ts
flashActivity(targetId, flash): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:260](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L260)

#### Parameters

##### targetId

`string`

##### flash

[`TabActivityFlash`](../type-aliases/TabActivityFlash.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`flashActivity`](TabAdornmentMethods.md#flashactivity)

***

### bindActivity()

```ts
bindActivity(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:261](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L261)

#### Parameters

##### binder

[`TabActivityBinder`](TabActivityBinder.md)

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`bindActivity`](TabAdornmentMethods.md#bindactivity)

***

### getIcons()

```ts
getIcons(targetId): TabIconAdornment[];
```

Defined in: [packages/sdk/src/tab-adornment.ts:264](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L264)

All leading icons for `targetId`, in set/bind order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabIconAdornment`](TabIconAdornment.md)[]

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`getIcons`](TabAdornmentMethods.md#geticons)

***

### getHighlight()

```ts
getHighlight(targetId): TabHighlightAdornment | null;
```

Defined in: [packages/sdk/src/tab-adornment.ts:269](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L269)

The whole-tab highlight for `targetId`, or `null` if none. At most one
applies — first found across `set`/`bind` order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabHighlightAdornment`](TabHighlightAdornment.md) \| `null`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`getHighlight`](TabAdornmentMethods.md#gethighlight)

***

### getIndicators()

```ts
getIndicators(targetId): TabIndicatorAdornment[];
```

Defined in: [packages/sdk/src/tab-adornment.ts:271](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L271)

All trailing indicators for `targetId`, in set/bind/flash order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabIndicatorAdornment`](TabIndicatorAdornment.md)[]

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`getIndicators`](TabAdornmentMethods.md#getindicators)

***

### getActivities()

```ts
getActivities(targetId): TabActivityAdornment[];
```

Defined in: [packages/sdk/src/tab-adornment.ts:273](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L273)

All trailing activities for `targetId`, in set/bind/flash order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabActivityAdornment`](TabActivityAdornment.md)[]

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`getActivities`](TabAdornmentMethods.md#getactivities)

***

### invalidateTabAdornments()

```ts
invalidateTabAdornments(): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:275](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L275)

Signal that binder data changed — re-query `provide` and re-render.

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`invalidateTabAdornments`](TabAdornmentMethods.md#invalidatetabadornments)

***

### subscribeTabAdornments()

```ts
subscribeTabAdornments(listener): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:276](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L276)

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`subscribeTabAdornments`](TabAdornmentMethods.md#subscribetabadornments)
