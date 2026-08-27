# Interface: ExtensionHandle\<API\>

Defined in: [packages/sdk/src/types.ts:929](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L929)

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

Defined in: [packages/sdk/src/types.ts:931](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L931)

The resolved extension's id.

***

### active

```ts
readonly active: boolean;
```

Defined in: [packages/sdk/src/types.ts:933](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L933)

True once that extension has activated.

***

### api

```ts
readonly api: API | undefined;
```

Defined in: [packages/sdk/src/types.ts:936](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L936)

Its published API (what its `activate` returned), or `undefined` if it
hasn't activated or published nothing.
