# Interface: ProcessService

Defined in: [packages/sdk/src/process-service.ts:150](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L150)

Persistent process / PTY sessions that **survive app restarts** — the core
primitive under the terminal (and future task runners, REPLs) — plus one-shot
[exec](#exec) for fire-and-forget subprocess execution.
Exposed as [ExtensionContext.process](ExtensionContext.md#process).

## Methods

### spawn()

```ts
spawn(opts): Promise<ProcessSession>;
```

Defined in: [packages/sdk/src/process-service.ts:152](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L152)

Spawn a new session in `opts.cwd`.

#### Parameters

##### opts

[`ProcessSpawnOptions`](ProcessSpawnOptions.md)

#### Returns

`Promise`\<[`ProcessSession`](ProcessSession.md)\>

***

### attach()

```ts
attach(id, opts?): Promise<ProcessSession>;
```

Defined in: [packages/sdk/src/process-service.ts:157](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L157)

Re-attach to an existing session by id (e.g. after an app restart). Rejects
with a 404-style error if the session no longer exists.

#### Parameters

##### id

`string`

##### opts?

###### cols?

`number`

###### rows?

`number`

#### Returns

`Promise`\<[`ProcessSession`](ProcessSession.md)\>

***

### exec()

```ts
exec(
   command, 
   args, 
options?): Promise<ProcessExecResult>;
```

Defined in: [packages/sdk/src/process-service.ts:189](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L189)

Run a one-shot command and resolve with its captured output — for
extensions that wrap a CLI (git, formatters, linters) rather than drive an
interactive shell. Use [spawn](#spawn) for long-lived
interactive sessions instead.

Runs **off the UI thread**, so a slow or network-bound command never
stutters the app. The returned promise rejects if the process could not be
spawned (e.g. the command was not found), or if a
[timeout](ProcessExecOptions.md#timeoutms) / [abort](ProcessExecOptions.md#signal)
fires (an `Error` with `name === "AbortError"`); a command that runs to
completion but exits non-zero **resolves** — check
[ProcessExecResult.code](ProcessExecResult.md#code) and [ProcessExecResult.stderr](ProcessExecResult.md#stderr).

#### Parameters

##### command

`string`

Executable to run (resolved via `PATH`), e.g. `"git"`.

##### args

`string`[]

Arguments passed verbatim — not shell-interpreted, so no
  quoting/escaping concerns and no shell-injection surface.

##### options?

[`ProcessExecOptions`](ProcessExecOptions.md)

Optional [ProcessExecOptions](ProcessExecOptions.md) (e.g. `cwd`).

#### Returns

`Promise`\<[`ProcessExecResult`](ProcessExecResult.md)\>

#### Example

```ts
const { stdout, code } = await ctx.process.exec(
  "git",
  ["status", "--porcelain=v2"],
  { cwd: workspaceFolder },
);
if (code === 0) parseStatus(stdout);
```
