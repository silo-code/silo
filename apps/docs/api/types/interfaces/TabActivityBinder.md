# Interface: TabActivityBinder

Defined in: [packages/sdk/src/tab-adornment.ts:219](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L219)

Keep a trailing-activity projection in sync for every editor/terminal tab.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:221](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L221)

Extension-owned key — conventionally `"<extension-id>.tab-activity"`.

## Methods

### provide()

```ts
provide(targetId): 
  | TabActivityContribution
  | null;
```

Defined in: [packages/sdk/src/tab-adornment.ts:222](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L222)

#### Parameters

##### targetId

`string`

#### Returns

  \| [`TabActivityContribution`](../type-aliases/TabActivityContribution.md)
  \| `null`
