# Interface: ExtensionHandle\<API\>

Defined in: [packages/sdk/src/types.ts:482](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L482)

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

Defined in: [packages/sdk/src/types.ts:484](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L484)

The resolved extension's id.

***

### active

```ts
readonly active: boolean;
```

Defined in: [packages/sdk/src/types.ts:486](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L486)

True once that extension has activated.

***

### api

```ts
readonly api: API | undefined;
```

Defined in: [packages/sdk/src/types.ts:489](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L489)

Its published API (what its `activate` returned), or `undefined` if it
hasn't activated or published nothing.
