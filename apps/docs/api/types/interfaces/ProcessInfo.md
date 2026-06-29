# Interface: ProcessInfo

Defined in: [packages/sdk/src/processes-service.ts:39](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L39)

Live view of what is currently running in one PTY session — the foreground
process group as reported by the pty-host daemon every ~750 ms.

Returned by [ProcessesService.getState](ProcessesService.md#getstate) and
[ProcessesService.getByTerminalId](ProcessesService.md#getbyterminalid); delivered to
[ProcessesService.subscribe](ProcessesService.md#subscribe) listeners on every change.

## Properties

### sessionId

```ts
readonly sessionId: string;
```

Defined in: [packages/sdk/src/processes-service.ts:41](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L41)

The underlying PTY session id — stable across app restarts.

***

### terminalId?

```ts
readonly optional terminalId?: string;
```

Defined in: [packages/sdk/src/processes-service.ts:48](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L48)

The terminal tab record id (e.g. `"term_abc"`) when this session is backed
by a visible terminal tab. `undefined` only for headless sessions created
directly via [ProcessService.spawn](ProcessService.md#spawn). Use to correlate with
`ctx.terminals` or to call `ctx.terminals.focus(terminalId)`.

***

### terminalTitle?

```ts
readonly optional terminalTitle?: string;
```

Defined in: [packages/sdk/src/processes-service.ts:54](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L54)

Display title of the terminal tab — matches the tab label the user sees
(`customName ?? title` from the terminal record). Undefined for headless
sessions.

***

### pgid

```ts
readonly pgid: number;
```

Defined in: [packages/sdk/src/processes-service.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L59)

Foreground process-group id — the group the PTY is currently routing input
to. Equals the PID of the group leader (by Unix convention).

***

### leader

```ts
readonly leader: string;
```

Defined in: [packages/sdk/src/processes-service.ts:61](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L61)

Name of the foreground program (e.g. `"node"`, `"vim"`, `"-zsh"`).

***

### cwd

```ts
readonly cwd: string;
```

Defined in: [packages/sdk/src/processes-service.ts:63](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L63)

Working directory of the foreground leader (`""` if unknown).

***

### atPrompt

```ts
readonly atPrompt: boolean;
```

Defined in: [packages/sdk/src/processes-service.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L65)

`true` when the foreground group is the shell itself — i.e. idle at a prompt.

***

### stats?

```ts
readonly optional stats?: ProcessStats;
```

Defined in: [packages/sdk/src/processes-service.ts:71](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L71)

CPU and memory snapshot. Only present while at least one extension has
called [ProcessesService.enableStats](ProcessesService.md#enablestats) and held its [Disposable](Disposable.md).
Absent otherwise (no polling overhead when nobody needs it).
