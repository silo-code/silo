# Class: PathDeniedError

Defined in: [packages/sdk/src/permissions.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/permissions.ts#L52)

Thrown by [FileService](../interfaces/FileService.md) and [ProcessService](../interfaces/ProcessService.md) when an extension
touches a path — or runs a process with a working directory — outside the open
workspace without the matching [Permission](../type-aliases/Permission.md). Catch it and degrade
gracefully, the same way you'd handle a missing file:

```ts
try {
  const text = await ctx.files.readText(path);
} catch (err) {
  if (err instanceof PathDeniedError) showMessage("That file is outside the workspace.");
}
```

## Extends

- `Error`

## Constructors

### Constructor

```ts
new PathDeniedError(path, message?): PathDeniedError;
```

Defined in: [packages/sdk/src/permissions.ts:56](https://github.com/silo-code/silo/blob/main/packages/sdk/src/permissions.ts#L56)

#### Parameters

##### path

`string`

##### message?

`string`

#### Returns

`PathDeniedError`

#### Overrides

```ts
Error.constructor
```

## Properties

### path

```ts
readonly path: string;
```

Defined in: [packages/sdk/src/permissions.ts:54](https://github.com/silo-code/silo/blob/main/packages/sdk/src/permissions.ts#L54)

The offending path, exactly as the extension passed it.

***

### name

```ts
name: string;
```

Defined in: node\_modules/.pnpm/typescript@5.8.3/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

```ts
Error.name
```

***

### message

```ts
message: string;
```

Defined in: node\_modules/.pnpm/typescript@5.8.3/node\_modules/typescript/lib/lib.es5.d.ts:1077

#### Inherited from

```ts
Error.message
```

***

### stack?

```ts
optional stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@5.8.3/node\_modules/typescript/lib/lib.es5.d.ts:1078

#### Inherited from

```ts
Error.stack
```
