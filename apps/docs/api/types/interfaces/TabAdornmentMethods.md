# Interface: TabAdornmentMethods

Defined in: [packages/sdk/src/tab-adornment.ts:184](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L184)

Shared adorn verbs for CenterDock editor and terminal tabs. Implemented by
[EditorService](EditorService.md) and [TerminalService](TerminalService.md) (target id is the editor
or terminal session id respectively).

## Extended by

- [`EditorService`](EditorService.md)
- [`TerminalService`](TerminalService.md)

## Methods

### setIcon()

```ts
setIcon(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:185](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L185)

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

Defined in: [packages/sdk/src/tab-adornment.ts:186](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L186)

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

Defined in: [packages/sdk/src/tab-adornment.ts:187](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L187)

#### Parameters

##### binder

[`TabIconBinder`](TabIconBinder.md)

#### Returns

[`Disposable`](Disposable.md)

***

### setIndicator()

```ts
setIndicator(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:189](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L189)

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

Defined in: [packages/sdk/src/tab-adornment.ts:190](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L190)

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

Defined in: [packages/sdk/src/tab-adornment.ts:191](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L191)

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

Defined in: [packages/sdk/src/tab-adornment.ts:192](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L192)

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

Defined in: [packages/sdk/src/tab-adornment.ts:194](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L194)

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

Defined in: [packages/sdk/src/tab-adornment.ts:195](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L195)

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

Defined in: [packages/sdk/src/tab-adornment.ts:196](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L196)

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

Defined in: [packages/sdk/src/tab-adornment.ts:197](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L197)

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

Defined in: [packages/sdk/src/tab-adornment.ts:200](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L200)

All leading icons for `targetId`, in set/bind order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabIconAdornment`](TabIconAdornment.md)[]

***

### getIndicators()

```ts
getIndicators(targetId): TabIndicatorAdornment[];
```

Defined in: [packages/sdk/src/tab-adornment.ts:202](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L202)

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

Defined in: [packages/sdk/src/tab-adornment.ts:204](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L204)

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

Defined in: [packages/sdk/src/tab-adornment.ts:206](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L206)

Signal that binder data changed — re-query `provide` and re-render.

#### Returns

`void`

***

### subscribeTabAdornments()

```ts
subscribeTabAdornments(listener): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:207](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L207)

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)
