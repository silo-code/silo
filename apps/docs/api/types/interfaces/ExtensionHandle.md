# Interface: ExtensionHandle\<API\>

Defined in: [packages/sdk/src/types.ts:1124](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L1124)

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

Defined in: [packages/sdk/src/types.ts:1126](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L1126)

The resolved extension's id.

***

### active

```ts
readonly active: boolean;
```

Defined in: [packages/sdk/src/types.ts:1128](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L1128)

True once that extension has activated.

***

### api

```ts
readonly api: API | undefined;
```

Defined in: [packages/sdk/src/types.ts:1131](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L1131)

Its published API (what its `activate` returned), or `undefined` if it
hasn't activated or published nothing.
