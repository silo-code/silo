# Interface: ExtensionHandle\<API\>

Defined in: [packages/sdk/src/types.ts:1051](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L1051)

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

Defined in: [packages/sdk/src/types.ts:1053](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L1053)

The resolved extension's id.

***

### active

```ts
readonly active: boolean;
```

Defined in: [packages/sdk/src/types.ts:1055](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L1055)

True once that extension has activated.

***

### api

```ts
readonly api: API | undefined;
```

Defined in: [packages/sdk/src/types.ts:1058](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L1058)

Its published API (what its `activate` returned), or `undefined` if it
hasn't activated or published nothing.
