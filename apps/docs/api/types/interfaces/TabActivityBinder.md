# Interface: TabActivityBinder

Defined in: [packages/sdk/src/tab-adornment.ts:170](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L170)

Keep a trailing-activity projection in sync for every editor/terminal tab.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:172](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L172)

Extension-owned key — conventionally `"<extension-id>.tab-activity"`.

## Methods

### provide()

```ts
provide(targetId): 
  | TabActivityContribution
  | null;
```

Defined in: [packages/sdk/src/tab-adornment.ts:173](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L173)

#### Parameters

##### targetId

`string`

#### Returns

  \| [`TabActivityContribution`](../type-aliases/TabActivityContribution.md)
  \| `null`
