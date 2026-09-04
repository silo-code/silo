# Interface: ProcessExecResult

Defined in: [packages/sdk/src/process-service.ts:128](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L128)

The captured result of a one-shot subprocess, returned by
[ProcessService.exec](ProcessService.md#exec).

## Properties

### stdout

```ts
stdout: string;
```

Defined in: [packages/sdk/src/process-service.ts:130](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L130)

Everything the command wrote to standard output.

***

### stderr

```ts
stderr: string;
```

Defined in: [packages/sdk/src/process-service.ts:132](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L132)

Everything the command wrote to standard error.

***

### code

```ts
code: number;
```

Defined in: [packages/sdk/src/process-service.ts:138](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L138)

The process exit code (`0` conventionally means success), or `-1` if the
process was terminated by a signal. A non-zero `code` is **not** an error —
`exec` resolves regardless; inspect `code`/`stderr` to decide.
