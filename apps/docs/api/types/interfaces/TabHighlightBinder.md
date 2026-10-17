# Interface: TabHighlightBinder

Defined in: [packages/sdk/src/tab-adornment.ts:187](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L187)

Keep a whole-tab highlight projection in sync for every editor/terminal
tab.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:189](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L189)

Extension-owned key — conventionally `"<extension-id>.tab-highlight"`.

## Methods

### provide()

```ts
provide(targetId): 
  | TabHighlightContribution
  | null;
```

Defined in: [packages/sdk/src/tab-adornment.ts:194](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L194)

Called synchronously per tab during render. Return `null` to contribute
no highlight for this target id.

#### Parameters

##### targetId

`string`

#### Returns

  \| [`TabHighlightContribution`](../type-aliases/TabHighlightContribution.md)
  \| `null`
