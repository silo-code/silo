# Interface: ExtensionHandle\<API\>

Defined in: [packages/sdk/src/types.ts:565](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L565)

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

Defined in: [packages/sdk/src/types.ts:567](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L567)

The resolved extension's id.

***

### active

```ts
readonly active: boolean;
```

Defined in: [packages/sdk/src/types.ts:569](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L569)

True once that extension has activated.

***

### api

```ts
readonly api: API | undefined;
```

Defined in: [packages/sdk/src/types.ts:572](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L572)

Its published API (what its `activate` returned), or `undefined` if it
hasn't activated or published nothing.
