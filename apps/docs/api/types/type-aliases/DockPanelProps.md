# Type Alias: DockPanelProps\<T\>

```ts
type DockPanelProps<T> = IDockviewPanelProps<T>;
```

Defined in: [packages/sdk/src/types.ts:73](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L73)

Props handed to a [DockPanelKind](../interfaces/DockPanelKind.md) component. Use this type to annotate
your component instead of importing `IDockviewPanelProps` from `dockview`
directly — the SDK wraps it so extensions remain insulated from dockview
version changes. The optional generic `T` narrows the shape of `params`.

## Type Parameters

### T

`T` *extends* `object` = `Record`\<`string`, `unknown`\>
