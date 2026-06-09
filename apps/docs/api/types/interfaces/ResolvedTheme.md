# Interface: ResolvedTheme

Defined in: [packages/sdk/src/theme-service.ts:47](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L47)

A theme id resolved to its base + effective variables — what the theme picker
renders swatches from, returned by [ThemeService.resolve](ThemeService.md#resolve).

## Properties

### base

```ts
base: ThemeBase;
```

Defined in: [packages/sdk/src/theme-service.ts:48](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L48)

***

### colorScheme

```ts
colorScheme: "dark" | "light";
```

Defined in: [packages/sdk/src/theme-service.ts:49](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L49)

***

### vars

```ts
vars: Partial<ThemeVars>;
```

Defined in: [packages/sdk/src/theme-service.ts:50](https://github.com/silo-code/silo/blob/main/packages/sdk/src/theme-service.ts#L50)
