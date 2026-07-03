# Interface: ProcessExecOptions

Defined in: [packages/sdk/src/process-service.ts:61](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L61)

Options for [ProcessService.exec](ProcessService.md#exec).

## Properties

### cwd?

```ts
optional cwd?: string;
```

Defined in: [packages/sdk/src/process-service.ts:69](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L69)

Working directory to run the command in. Defaults to the open **workspace
folder** when omitted — the right cwd for CLI tools (git, formatters,
linters) that operate on a repo. A `cwd` outside the workspace throws
[PathDeniedError](../classes/PathDeniedError.md) unless the extension declared the `process`
[Permission](../type-aliases/Permission.md). First-party (bundled) extensions are unscoped.

***

### env?

```ts
optional env?: Record<string, string>;
```

Defined in: [packages/sdk/src/process-service.ts:75](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L75)

Extra environment variables, **merged over** the host's environment (the
command inherits the host env; these keys add to or override it). Use it to
set things like `GIT_PAGER=cat` or a locale without clobbering `PATH`.

***

### timeoutMs?

```ts
optional timeoutMs?: number;
```

Defined in: [packages/sdk/src/process-service.ts:81](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L81)

Kill the process and reject after this many milliseconds. The whole process
group is terminated (not just the direct child), so shell wrappers don't
leak orphans. The rejection is an `Error` whose `name` is `"AbortError"`.

***

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [packages/sdk/src/process-service.ts:87](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L87)

Abort handle. Aborting kills the process (and its group) and rejects the
`exec` promise with an `Error` whose `name` is `"AbortError"` — the same
shape as a `timeoutMs` expiry, so callers branch on `err.name`.
