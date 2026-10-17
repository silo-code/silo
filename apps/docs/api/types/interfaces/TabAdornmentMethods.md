# Interface: TabAdornmentMethods

Defined in: [packages/sdk/src/tab-adornment.ts:233](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L233)

Shared adorn verbs for CenterDock editor and terminal tabs. Implemented by
[EditorService](EditorService.md) and [TerminalService](TerminalService.md) (target id is the editor
or terminal session id respectively).

## Extended by

- [`EditorService`](EditorService.md)
- [`PanelService`](PanelService.md)
- [`TerminalService`](TerminalService.md)

## Methods

### setIcon()

```ts
setIcon(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:234](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L234)

#### Parameters

##### targetId

`string`

##### adornment

[`TabIconAdornment`](TabIconAdornment.md)

#### Returns

`void`

***

### clearIcon()

```ts
clearIcon(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:235](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L235)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

***

### bindIcon()

```ts
bindIcon(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:236](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L236)

#### Parameters

##### binder

[`TabIconBinder`](TabIconBinder.md)

#### Returns

[`Disposable`](Disposable.md)

***

### setHighlight()

```ts
setHighlight(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:238](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L238)

#### Parameters

##### targetId

`string`

##### adornment

[`TabHighlightAdornment`](TabHighlightAdornment.md)

#### Returns

`void`

***

### clearHighlight()

```ts
clearHighlight(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:239](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L239)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

***

### bindHighlight()

```ts
bindHighlight(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:240](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L240)

#### Parameters

##### binder

[`TabHighlightBinder`](TabHighlightBinder.md)

#### Returns

[`Disposable`](Disposable.md)

***

### setIndicator()

```ts
setIndicator(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:242](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L242)

#### Parameters

##### targetId

`string`

##### adornment

[`TabIndicatorAdornment`](TabIndicatorAdornment.md)

#### Returns

`void`

***

### clearIndicator()

```ts
clearIndicator(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:243](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L243)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

***

### flashIndicator()

```ts
flashIndicator(targetId, flash): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:244](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L244)

#### Parameters

##### targetId

`string`

##### flash

[`TabIndicatorFlash`](../type-aliases/TabIndicatorFlash.md)

#### Returns

`void`

***

### bindIndicator()

```ts
bindIndicator(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:245](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L245)

#### Parameters

##### binder

[`TabIndicatorBinder`](TabIndicatorBinder.md)

#### Returns

[`Disposable`](Disposable.md)

***

### setActivity()

```ts
setActivity(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:247](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L247)

#### Parameters

##### targetId

`string`

##### adornment

[`TabActivityAdornment`](TabActivityAdornment.md)

#### Returns

`void`

***

### clearActivity()

```ts
clearActivity(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:248](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L248)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

***

### flashActivity()

```ts
flashActivity(targetId, flash): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:249](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L249)

#### Parameters

##### targetId

`string`

##### flash

[`TabActivityFlash`](../type-aliases/TabActivityFlash.md)

#### Returns

`void`

***

### bindActivity()

```ts
bindActivity(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:250](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L250)

#### Parameters

##### binder

[`TabActivityBinder`](TabActivityBinder.md)

#### Returns

[`Disposable`](Disposable.md)

***

### getIcons()

```ts
getIcons(targetId): TabIconAdornment[];
```

Defined in: [packages/sdk/src/tab-adornment.ts:253](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L253)

All leading icons for `targetId`, in set/bind order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabIconAdornment`](TabIconAdornment.md)[]

***

### getHighlight()

```ts
getHighlight(targetId): TabHighlightAdornment | null;
```

Defined in: [packages/sdk/src/tab-adornment.ts:258](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L258)

The whole-tab highlight for `targetId`, or `null` if none. At most one
applies — first found across `set`/`bind` order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabHighlightAdornment`](TabHighlightAdornment.md) \| `null`

***

### getIndicators()

```ts
getIndicators(targetId): TabIndicatorAdornment[];
```

Defined in: [packages/sdk/src/tab-adornment.ts:260](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L260)

All trailing indicators for `targetId`, in set/bind/flash order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabIndicatorAdornment`](TabIndicatorAdornment.md)[]

***

### getActivities()

```ts
getActivities(targetId): TabActivityAdornment[];
```

Defined in: [packages/sdk/src/tab-adornment.ts:262](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L262)

All trailing activities for `targetId`, in set/bind/flash order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabActivityAdornment`](TabActivityAdornment.md)[]

***

### invalidateTabAdornments()

```ts
invalidateTabAdornments(): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:264](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L264)

Signal that binder data changed — re-query `provide` and re-render.

#### Returns

`void`

***

### subscribeTabAdornments()

```ts
subscribeTabAdornments(listener): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:265](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L265)

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)
