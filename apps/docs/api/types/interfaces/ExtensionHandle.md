# Interface: ExtensionHandle\<API\>

Defined in: [packages/sdk/src/types.ts:526](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L526)

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

Defined in: [packages/sdk/src/types.ts:528](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L528)

The resolved extension's id.

***

### active

```ts
readonly active: boolean;
```

Defined in: [packages/sdk/src/types.ts:530](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L530)

True once that extension has activated.

***

### api

```ts
readonly api: API | undefined;
```

Defined in: [packages/sdk/src/types.ts:533](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L533)

Its published API (what its `activate` returned), or `undefined` if it
hasn't activated or published nothing.
