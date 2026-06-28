# Interface: ExtensionHandle\<API\>

Defined in: [packages/sdk/src/types.ts:556](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L556)

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

Defined in: [packages/sdk/src/types.ts:558](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L558)

The resolved extension's id.

***

### active

```ts
readonly active: boolean;
```

Defined in: [packages/sdk/src/types.ts:560](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L560)

True once that extension has activated.

***

### api

```ts
readonly api: API | undefined;
```

Defined in: [packages/sdk/src/types.ts:563](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L563)

Its published API (what its `activate` returned), or `undefined` if it
hasn't activated or published nothing.
