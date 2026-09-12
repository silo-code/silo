# Interface: ExtensionHandle\<API\>

Defined in: [packages/sdk/src/types.ts:1064](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L1064)

A handle to another extension, obtained via
[ExtensionContext.getExtension](ExtensionContext.md#getextension). Lets one extension consume another's
published API while tolerating its absence.

## Type Parameters

### API

`API` = `unknown`

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/types.ts:1066](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L1066)

The resolved extension's id.

***

### active

```ts
readonly active: boolean;
```

Defined in: [packages/sdk/src/types.ts:1068](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L1068)

True once that extension has activated.

***

### api

```ts
readonly api: API | undefined;
```

Defined in: [packages/sdk/src/types.ts:1071](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L1071)

Its published API (what its `activate` returned), or `undefined` if it
hasn't activated or published nothing.
