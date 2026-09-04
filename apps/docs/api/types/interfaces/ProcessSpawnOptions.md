# Interface: ProcessSpawnOptions

Defined in: [packages/sdk/src/process-service.ts:14](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L14)

Options for spawning a process session. Today sessions are shell PTYs, so
`cwd` is required (the webview has no ambient working directory).

## Properties

### cwd

```ts
cwd: string;
```

Defined in: [packages/sdk/src/process-service.ts:21](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L21)

Working directory the session starts in. Must resolve inside the open
workspace unless the extension declared the `process` [Permission](../type-aliases/Permission.md)
(first-party extensions are unscoped); otherwise throws
[PathDeniedError](../classes/PathDeniedError.md).

***

### cols?

```ts
optional cols?: number;
```

Defined in: [packages/sdk/src/process-service.ts:23](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L23)

Initial column count.

***

### rows?

```ts
optional rows?: number;
```

Defined in: [packages/sdk/src/process-service.ts:25](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L25)

Initial row count.

***

### env?

```ts
optional env?: Record<string, string>;
```

Defined in: [packages/sdk/src/process-service.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L38)

Extra environment variables, **merged over** the session's inherited
environment. Use it for things a long-lived shell needs from the start —
`NO_COLOR`, a locale, a tool's config directory — without clobbering
`PATH`.

Keys beginning `SILO_` (and the bare `SILO`) are **reserved by the host**
and are dropped: Silo stamps its own
[terminal identity](https://getsilo.dev/api/terminal-environment)
there, and a guard keyed on a value any caller could write would be no
guard at all. Dropped keys are logged to the Extension Host output channel.
