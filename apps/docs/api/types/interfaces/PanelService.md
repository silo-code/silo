# Interface: PanelService

Defined in: [packages/sdk/src/panel-service.ts:26](https://github.com/silo-code/silo/blob/main/packages/sdk/src/panel-service.ts#L26)

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

### setIcon()

```ts
setIcon(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:229](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L229)

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

Defined in: [packages/sdk/src/tab-adornment.ts:230](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L230)

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

Defined in: [packages/sdk/src/tab-adornment.ts:231](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L231)

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

Defined in: [packages/sdk/src/tab-adornment.ts:233](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L233)

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

Defined in: [packages/sdk/src/tab-adornment.ts:234](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L234)

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

Defined in: [packages/sdk/src/tab-adornment.ts:235](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L235)

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

Defined in: [packages/sdk/src/tab-adornment.ts:237](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L237)

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

Defined in: [packages/sdk/src/tab-adornment.ts:238](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L238)

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

Defined in: [packages/sdk/src/tab-adornment.ts:239](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L239)

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

Defined in: [packages/sdk/src/tab-adornment.ts:240](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L240)

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

Defined in: [packages/sdk/src/tab-adornment.ts:242](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L242)

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

Defined in: [packages/sdk/src/tab-adornment.ts:243](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L243)

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

Defined in: [packages/sdk/src/tab-adornment.ts:244](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L244)

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

Defined in: [packages/sdk/src/tab-adornment.ts:245](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L245)

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

Defined in: [packages/sdk/src/tab-adornment.ts:248](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L248)

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

Defined in: [packages/sdk/src/tab-adornment.ts:253](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L253)

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

Defined in: [packages/sdk/src/tab-adornment.ts:255](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L255)

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

Defined in: [packages/sdk/src/tab-adornment.ts:257](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L257)

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

Defined in: [packages/sdk/src/tab-adornment.ts:259](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L259)

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

Defined in: [packages/sdk/src/tab-adornment.ts:260](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L260)

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`subscribeTabAdornments`](TabAdornmentMethods.md#subscribetabadornments)
