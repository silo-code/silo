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
