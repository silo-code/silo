# Interface: ExtensionHandle\<API\>

Defined in: [packages/sdk/src/types.ts:576](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L576)

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

Defined in: [packages/sdk/src/types.ts:578](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L578)

The resolved extension's id.

***

### active

```ts
readonly active: boolean;
```

Defined in: [packages/sdk/src/types.ts:580](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L580)

True once that extension has activated.

***

### api

```ts
readonly api: API | undefined;
```

Defined in: [packages/sdk/src/types.ts:583](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L583)

Its published API (what its `activate` returned), or `undefined` if it
hasn't activated or published nothing.
