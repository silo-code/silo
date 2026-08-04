# Type Alias: TabIconContribution

```ts
type TabIconContribution = Omit<TabIconAdornment, "id">;
```

Defined in: [packages/sdk/src/tab-adornment.ts:132](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L132)

Fields contributed by a [TabIconBinder.provide](../interfaces/TabIconBinder.md#provide) call (the binder’s
own `id` is applied by the host).
