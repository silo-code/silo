# Interface: TabIndicatorBinder

Defined in: [packages/sdk/src/tab-adornment.ts:154](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L154)

Keep a trailing-indicator projection in sync for every editor/terminal tab.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:156](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L156)

Extension-owned key — conventionally `"<extension-id>.tab-indicator"`.

## Methods

### provide()

```ts
provide(targetId): 
  | TabIndicatorContribution
  | null;
```

Defined in: [packages/sdk/src/tab-adornment.ts:161](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L161)

Called synchronously per tab during render. Return `null` to contribute
nothing for this target id.

#### Parameters

##### targetId

`string`

#### Returns

  \| [`TabIndicatorContribution`](../type-aliases/TabIndicatorContribution.md)
  \| `null`
