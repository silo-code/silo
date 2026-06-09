# Interface: ThemePreset

Defined in: [packages/sdk/src/theme-service.ts:27](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L27)

A selectable theme contributed via
[ExtensionContext.registerThemePreset](ExtensionContext.md#registerthemepreset). Built-in presets (Tokyo Night,
Solarized Light, Gruvbox Dark, …) are registered by the `theme-presets`
extension; core ships only Dark and Light. A preset's [ThemePreset.vars](#vars)
are injected as CSS custom properties when it is the active theme.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/theme-service.ts:29](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L29)

Unique id (also the persisted `activeThemeId` when selected).

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/theme-service.ts:31](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L31)

Display name shown in the theme picker.

***

### base

```ts
base: ThemeBase;
```

Defined in: [packages/sdk/src/theme-service.ts:33](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L33)

Dark or light — drives the Monaco/xterm base and the `data-theme` attribute.

***

### colorScheme

```ts
colorScheme: "dark" | "light";
```

Defined in: [packages/sdk/src/theme-service.ts:35](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L35)

The CSS `color-scheme` for native controls.

***

### vars

```ts
vars: Partial<ThemeVars>;
```

Defined in: [packages/sdk/src/theme-service.ts:37](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L37)

CSS variable overrides applied on top of the base palette in `theme.css`.
