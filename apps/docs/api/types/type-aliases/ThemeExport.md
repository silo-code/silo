# Type Alias: ThemeExport

```ts
type ThemeExport = Omit<CustomTheme, "id">;
```

Defined in: [packages/sdk/src/domain-types.ts:254](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L254)

A [CustomTheme](../interfaces/CustomTheme.md) without its `id` — the shape exported/imported as a
shareable theme file.
