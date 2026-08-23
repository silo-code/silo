# Interface: ProcessExecResult

Defined in: [packages/sdk/src/process-service.ts:115](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L115)

The captured result of a one-shot subprocess, returned by
[ProcessService.exec](ProcessService.md#exec).

## Properties

### stdout

```ts
stdout: string;
```

Defined in: [packages/sdk/src/process-service.ts:117](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L117)

Everything the command wrote to standard output.

***

### stderr

```ts
stderr: string;
```

Defined in: [packages/sdk/src/process-service.ts:119](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L119)

Everything the command wrote to standard error.

***

### code

```ts
code: number;
```

Defined in: [packages/sdk/src/process-service.ts:125](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L125)

The process exit code (`0` conventionally means success), or `-1` if the
process was terminated by a signal. A non-zero `code` is **not** an error —
`exec` resolves regardless; inspect `code`/`stderr` to decide.
