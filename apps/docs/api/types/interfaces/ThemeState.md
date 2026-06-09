# Interface: ThemeState

Defined in: [packages/sdk/src/theme-service.ts:63](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L63)

An immutable, frozen view of theme state, returned by
[ThemeService.getState](ThemeService.md#getstate) and delivered to subscribers — read access
without a Valtio dependency. `presets` is part of the state (not a static
read) because presets are dynamic: extensions register and unregister them at
runtime.

## Properties

### activeId

```ts
activeId: string;
```

Defined in: [packages/sdk/src/theme-service.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L65)

The active theme's id (a preset id or a custom theme id).

***

### presets

```ts
presets: readonly ThemePreset[];
```

Defined in: [packages/sdk/src/theme-service.ts:67](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L67)

Core Dark/Light followed by every registered preset, in registration order.

***

### customThemes

```ts
customThemes: readonly CustomTheme[];
```

Defined in: [packages/sdk/src/theme-service.ts:69](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L69)

The user's custom themes, loaded from disk.
