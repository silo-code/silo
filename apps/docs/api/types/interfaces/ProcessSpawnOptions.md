# Interface: ProcessSpawnOptions

Defined in: [packages/sdk/src/process-service.ts:13](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L13)

Options for spawning a process session. Today sessions are shell PTYs, so
`cwd` is required (the webview has no ambient working directory).

## Properties

### cwd

```ts
cwd: string;
```

Defined in: [packages/sdk/src/process-service.ts:20](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L20)

Working directory the session starts in. Must resolve inside the open
workspace unless the extension declared the `process` [Permission](../type-aliases/Permission.md)
(first-party extensions are unscoped); otherwise throws
[PathDeniedError](../classes/PathDeniedError.md).

***

### cols?

```ts
optional cols?: number;
```

Defined in: [packages/sdk/src/process-service.ts:22](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L22)

Initial column count.

***

### rows?

```ts
optional rows?: number;
```

Defined in: [packages/sdk/src/process-service.ts:24](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L24)

Initial row count.
