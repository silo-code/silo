# Interface: ThemeService

Defined in: [packages/sdk/src/theme-service.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L82)

Consumer API for the theme domain, exposed as [ExtensionContext.theme](ExtensionContext.md#theme).
Read via [getState](#getstate) /
[subscribe](#subscribe) (e.g. with `useSyncExternalStore`);
drive via [setActive](#setactive) and the custom-theme
methods. Contribute a new preset via [ThemeService.registerPreset](#registerpreset).

## Methods

### getState()

```ts
getState(): ThemeState;
```

Defined in: [packages/sdk/src/theme-service.ts:84](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L84)

Current frozen view of theme state.

#### Returns

[`ThemeState`](ThemeState.md)

***

### subscribe()

```ts
subscribe(listener): Disposable;
```

Defined in: [packages/sdk/src/theme-service.ts:86](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L86)

Subscribe to theme-state changes (active theme, custom themes, or presets).

#### Parameters

##### listener

(`s`) => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### setActive()

```ts
setActive(id): void;
```

Defined in: [packages/sdk/src/theme-service.ts:88](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L88)

Set the active theme by id (a built-in preset, registered preset, or custom).

#### Parameters

##### id

`string`

#### Returns

`void`

***

### resolve()

```ts
resolve(id): ResolvedTheme;
```

Defined in: [packages/sdk/src/theme-service.ts:90](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L90)

Resolve a theme id to its base + effective vars (for previews/swatches).

#### Parameters

##### id

`string`

#### Returns

[`ResolvedTheme`](ResolvedTheme.md)

***

### saveCustom()

```ts
saveCustom(theme): Promise<void>;
```

Defined in: [packages/sdk/src/theme-service.ts:92](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L92)

Persist a custom theme to disk and refresh the in-memory list.

#### Parameters

##### theme

[`CustomTheme`](CustomTheme.md)

#### Returns

`Promise`\<`void`\>

***

### deleteCustom()

```ts
deleteCustom(id): Promise<void>;
```

Defined in: [packages/sdk/src/theme-service.ts:94](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L94)

Delete a custom theme from disk and refresh the in-memory list.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>

***

### reloadCustom()

```ts
reloadCustom(): Promise<void>;
```

Defined in: [packages/sdk/src/theme-service.ts:96](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L96)

Reload custom themes from disk into the store.

#### Returns

`Promise`\<`void`\>

***

### exportTheme()

```ts
exportTheme(theme): ThemeExport;
```

Defined in: [packages/sdk/src/theme-service.ts:98](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L98)

Strip the id from a custom theme for sharing/serialization.

#### Parameters

##### theme

[`CustomTheme`](CustomTheme.md)

#### Returns

[`ThemeExport`](../type-aliases/ThemeExport.md)

***

### importTheme()

```ts
importTheme(data): CustomTheme;
```

Defined in: [packages/sdk/src/theme-service.ts:100](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L100)

Validate/parse imported JSON into a custom theme (assigns a fresh id).

#### Parameters

##### data

`unknown`

#### Returns

[`CustomTheme`](CustomTheme.md)

***

### registerPreset()

```ts
registerPreset(preset): Disposable;
```

Defined in: [packages/sdk/src/theme-service.ts:117](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L117)

Register a [ThemePreset](ThemePreset.md) (a selectable theme in the picker). The
preset appears immediately and is removed when the returned
[Disposable](Disposable.md) is disposed (typically when the extension deactivates).

#### Parameters

##### preset

[`ThemePreset`](ThemePreset.md)

#### Returns

[`Disposable`](Disposable.md)

#### Example

```ts
ctx.theme.registerPreset({
  id: "my-theme",
  name: "My Theme",
  base: "dark",
  colorScheme: "dark",
  vars: { "--silo-color-bg": "#1a1a2e" },
});
```
