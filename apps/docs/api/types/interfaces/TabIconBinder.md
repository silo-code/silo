# Interface: TabIconBinder

Defined in: [packages/sdk/src/tab-adornment.ts:165](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L165)

Keep a leading-icon projection in sync for every editor/terminal tab.
Prefer over repeatedly calling [EditorService.setIcon](EditorService.md#seticon).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:167](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L167)

Extension-owned key — conventionally `"<extension-id>.tab-icon"`.

## Methods

### provide()

```ts
provide(targetId): TabIconContribution | null;
```

Defined in: [packages/sdk/src/tab-adornment.ts:172](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L172)

Called synchronously per tab during render. Return `null` to contribute
nothing for this target id (editor id or terminal session id).

#### Parameters

##### targetId

`string`

#### Returns

[`TabIconContribution`](../type-aliases/TabIconContribution.md) \| `null`
