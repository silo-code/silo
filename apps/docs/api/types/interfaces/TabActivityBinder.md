# Interface: TabActivityBinder

Defined in: [packages/sdk/src/tab-adornment.ts:214](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L214)

Keep a trailing-activity projection in sync for every editor/terminal tab.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:216](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L216)

Extension-owned key — conventionally `"<extension-id>.tab-activity"`.

## Methods

### provide()

```ts
provide(targetId): 
  | TabActivityContribution
  | null;
```

Defined in: [packages/sdk/src/tab-adornment.ts:217](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L217)

#### Parameters

##### targetId

`string`

#### Returns

  \| [`TabActivityContribution`](../type-aliases/TabActivityContribution.md)
  \| `null`
