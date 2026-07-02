# Interface: ExtensionHandle\<API\>

Defined in: [packages/sdk/src/types.ts:653](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L653)

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

Defined in: [packages/sdk/src/types.ts:655](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L655)

The resolved extension's id.

***

### active

```ts
readonly active: boolean;
```

Defined in: [packages/sdk/src/types.ts:657](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L657)

True once that extension has activated.

***

### api

```ts
readonly api: API | undefined;
```

Defined in: [packages/sdk/src/types.ts:660](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L660)

Its published API (what its `activate` returned), or `undefined` if it
hasn't activated or published nothing.
