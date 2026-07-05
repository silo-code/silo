# Interface: ProcessExecResult

Defined in: [packages/sdk/src/process-service.ts:97](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L97)

The captured result of a one-shot subprocess, returned by
[ProcessService.exec](ProcessService.md#exec).

## Properties

### stdout

```ts
stdout: string;
```

Defined in: [packages/sdk/src/process-service.ts:99](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L99)

Everything the command wrote to standard output.

***

### stderr

```ts
stderr: string;
```

Defined in: [packages/sdk/src/process-service.ts:101](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L101)

Everything the command wrote to standard error.

***

### code

```ts
code: number;
```

Defined in: [packages/sdk/src/process-service.ts:107](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L107)

The process exit code (`0` conventionally means success), or `-1` if the
process was terminated by a signal. A non-zero `code` is **not** an error —
`exec` resolves regardless; inspect `code`/`stderr` to decide.
