# Interface: DockPanelProps\<T\>

Defined in: [packages/sdk/src/types.ts:171](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L171)

Props handed to a [DockPanelKind](DockPanelKind.md) component. Use this type to annotate
your component instead of importing from the underlying dock framework
directly — the SDK owns this surface so extensions remain insulated from
host implementation details. The optional generic `T` narrows `params`.

## Type Parameters

### T

`T` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### api

```ts
api: DockPanelApi;
```

Defined in: [packages/sdk/src/types.ts:173](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L173)

The panel API — drives the tab (title, close, focus, params).

***

### params

```ts
params: T;
```

Defined in: [packages/sdk/src/types.ts:175](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L175)

Serializable parameters forwarded to the panel at open time.
