# ctx.process <Badge type="tip" text="stable" />

The "running things" domain. Two halves: **persistent process / PTY sessions**
that **survive app restarts** (the core primitive under the terminal and future
task runners / REPLs), and **one-shot [`exec`](#one-shot-exec)** for extensions
that wrap a CLI (git, formatters, linters) rather than drive an interactive
shell.

```ts
ctx.process: ProcessService
```

## Example

```tsx
// spawn a shell session in the workspace folder
const session = await ctx.process.spawn({ cwd, cols: 120, rows: 40 });

session.onData((data) => term.write(data)); // stream output to your UI
session.write("ls -la\n"); // send input

// later, after an app restart, reconnect by id:
const again = await ctx.process.attach(session.id);
```

## One-shot exec

For fire-and-forget commands, `exec` runs a subprocess **off the UI thread** and
resolves with its captured output. Arguments are passed verbatim (not
shell-interpreted), so there's no quoting or shell-injection concern.

```ts
const { stdout, stderr, code } = await ctx.process.exec(
  "git",
  ["status", "--porcelain=v2", "--untracked-files=all"],
  { cwd: workspaceFolder },
);
if (code === 0) parseStatus(stdout);
else console.error(stderr);
```

A command that runs but **exits non-zero still resolves** — inspect `code` /
`stderr` to decide. The promise rejects only when the process can't be spawned
at all (e.g. the executable isn't on `PATH`). This is the primitive the
[git extension](/roadmap) builds on, replacing bespoke per-tool host commands.

## Methods

**`ProcessService`** (`ctx.process`):

| Method                                                                       | What it does                                                                                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`spawn(opts)`](/api/types/interfaces/ProcessService#spawn)                  | Start a new session in `opts.cwd`; resolves to a [`ProcessSession`](/api/types/interfaces/ProcessSession).              |
| [`attach(id, opts?)`](/api/types/interfaces/ProcessService#attach)           | Re-attach to an existing session by id; rejects if it's gone.                                                           |
| [`exec(command, args, options?)`](/api/types/interfaces/ProcessService#exec) | Run a one-shot command off the UI thread; resolves to a [`ProcessExecResult`](/api/types/interfaces/ProcessExecResult). |

**[`ProcessSession`](/api/types/interfaces/ProcessSession)** (the handle):

| Method                                            | What it does                                                                                                                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `write(data)`                                     | Send input to the session.                                                                                                                                                                               |
| `resize(cols, rows)`                              | Notify the session of a viewport size change.                                                                                                                                                            |
| `kill()`                                          | Terminate and release the session.                                                                                                                                                                       |
| `getBuffer()` / `saveBuffer(data)`                | Read / persist the output buffer (restore a view on re-attach).                                                                                                                                          |
| `onData(listener, options?)` / `onExit(listener)` | Subscribe to output / exit; returns a [`Disposable`](/api/types/interfaces/Disposable). `onData` is live output only unless `{ includeReplay: true }` — see [Replayed scrollback](#replayed-scrollback). |

## Replayed scrollback

A session survives app restarts, so re-attaching to one makes the session host
replay its recent scrollback — bytes indistinguishable from output arriving
right now.

`onData` delivers **live output only** by default, so re-attaching can't make
your extension believe a burst of output just happened. Pass
`{ includeReplay: true }` when you want the history (painting scrollback into a
fresh view, say); each chunk then carries an
[`OutputOrigin`](/api/types/interfaces/OutputOrigin) saying which kind it is.

```ts
const session = await ctx.process.attach(id);
session.onData(
  (data, { replay }) => {
    term.write(data);
    if (!replay) noteActivity();
  },
  { includeReplay: true },
);
```

## Types

[`ProcessService`](/api/types/interfaces/ProcessService) ·
[`ProcessSession`](/api/types/interfaces/ProcessSession) ·
[`ProcessSpawnOptions`](/api/types/interfaces/ProcessSpawnOptions) ·
[`ProcessExecOptions`](/api/types/interfaces/ProcessExecOptions) ·
[`ProcessExecResult`](/api/types/interfaces/ProcessExecResult).

## Workspace scoping {#workspace-scoping}

A third-party extension's processes are **scoped to the open workspace**: a
session or `exec` defaults its working directory to the workspace folder, and a
`cwd` outside it throws [`PathDeniedError`](/api/types/classes/PathDeniedError)
unless the extension declared the `process`
[`Permission`](/api/types/type-aliases/Permission) (consented to at install). The
command and its arguments aren't constrained — cwd is the enforceable knob
in-process. See the [Permissions & access](/guide/permissions) guide.
(First-party bundled extensions are unscoped.)

## Notes

Today sessions are shell PTYs, backed by Silo's self-owned PTY session host — a
daemon the app owns, with no external dependency. The persistence lives in core, so a session outlives the extension
that opened it _and_ an app restart — which is why the built-in terminal can be
a [removable/replaceable extension](/roadmap) on top of this primitive.
