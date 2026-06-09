# Interface: ThemeService

Defined in: [packages/sdk/src/theme-service.ts:83](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L83)

Consumer API for the theme domain, exposed as [ExtensionContext.theme](ExtensionContext.md#theme).
Read via [getState](#getstate) /
[subscribe](#subscribe) (e.g. with `useSyncExternalStore`);
drive via [setActive](#setactive) and the custom-theme
methods. Contributing a *new* preset is a separate concern —
[ExtensionContext.registerThemePreset](ExtensionContext.md#registerthemepreset).

## Methods

### getState()

```ts
getState(): ThemeState;
```

Defined in: [packages/sdk/src/theme-service.ts:85](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L85)

Current frozen view of theme state.

#### Returns

[`ThemeState`](ThemeState.md)

***

### subscribe()

```ts
subscribe(listener): Disposable;
```

Defined in: [packages/sdk/src/theme-service.ts:87](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L87)

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

Defined in: [packages/sdk/src/theme-service.ts:89](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L89)

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

Defined in: [packages/sdk/src/theme-service.ts:91](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L91)

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

Defined in: [packages/sdk/src/theme-service.ts:93](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L93)

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

Defined in: [packages/sdk/src/theme-service.ts:95](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L95)

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

Defined in: [packages/sdk/src/theme-service.ts:97](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L97)

Reload custom themes from disk into the store.

#### Returns

`Promise`\<`void`\>

***

### exportTheme()

```ts
exportTheme(theme): ThemeExport;
```

Defined in: [packages/sdk/src/theme-service.ts:99](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L99)

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

Defined in: [packages/sdk/src/theme-service.ts:101](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L101)

Validate/parse imported JSON into a custom theme (assigns a fresh id).

#### Parameters

##### data

`unknown`

#### Returns

[`CustomTheme`](CustomTheme.md)
