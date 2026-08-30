# Class: NoWorkspaceError

Defined in: [packages/sdk/src/permissions.ts:88](https://github.com/silo-code/silo/blob/main/packages/sdk/src/permissions.ts#L88)

Thrown when an API that needs the **active workspace** is called while no
workspace is open — today, [ExtensionStorageScopes.workspaceDir](../interfaces/ExtensionStorageScopes.md#workspacedir).

It is deliberately not a [PathDeniedError](PathDeniedError.md): nothing was denied, there
is simply nothing to scope to yet. Catch it to fall back to
[globalDir](../interfaces/ExtensionStorageScopes.md#globaldir) or to defer the work
until a workspace opens:

```ts
try {
  const dir = await ctx.storage.workspaceDir();
} catch (err) {
  if (err instanceof NoWorkspaceError) return; // nothing to persist yet
  throw err;
}
```

## Extends

- `Error`

## Constructors

### Constructor

```ts
new NoWorkspaceError(message?): NoWorkspaceError;
```

Defined in: [packages/sdk/src/permissions.ts:89](https://github.com/silo-code/silo/blob/main/packages/sdk/src/permissions.ts#L89)

#### Parameters

##### message?

`string`

#### Returns

`NoWorkspaceError`

#### Overrides

```ts
Error.constructor
```

## Properties

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
