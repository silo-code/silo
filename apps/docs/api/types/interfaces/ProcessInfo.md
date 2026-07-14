# Interface: ProcessInfo

Defined in: [packages/sdk/src/processes-service.ts:57](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L57)

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

Defined in: [packages/sdk/src/processes-service.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L59)

The underlying PTY session id — stable across app restarts.

***

### workspaceId

```ts
readonly workspaceId: string;
```

Defined in: [packages/sdk/src/processes-service.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L65)

The workspace this session belongs to. Use to group entries when
requesting [ProcessesService.getState](ProcessesService.md#getstate) with `{ allWorkspaces: true }`,
or to correlate with `ctx.workspaces`.

***

### terminalId?

```ts
readonly optional terminalId?: string;
```

Defined in: [packages/sdk/src/processes-service.ts:72](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L72)

The terminal tab record id (e.g. `"term_abc"`) when this session is backed
by a visible terminal tab. `undefined` only for headless sessions created
directly via [ProcessService.spawn](ProcessService.md#spawn). Use to correlate with
`ctx.terminals` or to call `ctx.terminals.focus(terminalId)`.

***

### terminalTitle?

```ts
readonly optional terminalTitle?: string;
```

Defined in: [packages/sdk/src/processes-service.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L78)

Display title of the terminal tab — matches the tab label the user sees
(`customName ?? title` from the terminal record). Undefined for headless
sessions.

***

### pgid

```ts
readonly pgid: number;
```

Defined in: [packages/sdk/src/processes-service.ts:83](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L83)

Foreground process-group id — the group the PTY is currently routing input
to. Equals the PID of the group leader (by Unix convention).

***

### leader

```ts
readonly leader: string;
```

Defined in: [packages/sdk/src/processes-service.ts:85](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L85)

Name of the foreground program (e.g. `"node"`, `"vim"`, `"-zsh"`).

***

### cwd

```ts
readonly cwd: string;
```

Defined in: [packages/sdk/src/processes-service.ts:87](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L87)

Working directory of the foreground leader (`""` if unknown).

***

### atPrompt

```ts
readonly atPrompt: boolean;
```

Defined in: [packages/sdk/src/processes-service.ts:89](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L89)

`true` when the foreground group is the shell itself — i.e. idle at a prompt.

***

### stats?

```ts
readonly optional stats?: ProcessStats;
```

Defined in: [packages/sdk/src/processes-service.ts:95](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L95)

CPU and memory snapshot. Only present while at least one extension has
called [ProcessesService.enableStats](ProcessesService.md#enablestats) and held its [Disposable](Disposable.md).
Absent otherwise (no polling overhead when nobody needs it).

***

### tree?

```ts
readonly optional tree?: ProcessTreeNode;
```

Defined in: [packages/sdk/src/processes-service.ts:102](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L102)

Process tree rooted at the foreground leader (the root node is the leader
itself; descendants are found via parent edges, unioned on Unix with
orphaned processes sharing the leader's process group). Only present while
at least one extension holds `enableStats({ trees: true })`.
