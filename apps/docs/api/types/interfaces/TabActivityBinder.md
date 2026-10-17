# Interface: TabActivityBinder

Defined in: [packages/sdk/src/tab-adornment.ts:230](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L230)

Keep a trailing-activity projection in sync for every editor/terminal tab.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:232](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L232)

Extension-owned key — conventionally `"<extension-id>.tab-activity"`.

## Methods

### provide()

```ts
provide(targetId): 
  | TabActivityContribution
  | null;
```

Defined in: [packages/sdk/src/tab-adornment.ts:233](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L233)

#### Parameters

##### targetId

`string`

#### Returns

  \| [`TabActivityContribution`](../type-aliases/TabActivityContribution.md)
  \| `null`
