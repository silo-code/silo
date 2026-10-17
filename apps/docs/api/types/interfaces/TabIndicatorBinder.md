# Interface: TabIndicatorBinder

Defined in: [packages/sdk/src/tab-adornment.ts:214](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L214)

Keep a trailing-indicator projection in sync for every editor/terminal tab.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:216](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L216)

Extension-owned key — conventionally `"<extension-id>.tab-indicator"`.

## Methods

### provide()

```ts
provide(targetId): 
  | TabIndicatorContribution
  | null;
```

Defined in: [packages/sdk/src/tab-adornment.ts:221](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L221)

Called synchronously per tab during render. Return `null` to contribute
nothing for this target id.

#### Parameters

##### targetId

`string`

#### Returns

  \| [`TabIndicatorContribution`](../type-aliases/TabIndicatorContribution.md)
  \| `null`
