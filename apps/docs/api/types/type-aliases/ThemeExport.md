# Type Alias: ThemeExport

```ts
type ThemeExport = Omit<CustomTheme, "id">;
```

Defined in: [packages/sdk/src/domain-types.ts:250](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L250)

A [CustomTheme](../interfaces/CustomTheme.md) without its `id` — the shape exported/imported as a
shareable theme file.
