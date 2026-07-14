# Interface: ProcessesService

Defined in: [packages/sdk/src/processes-service.ts:127](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L127)

Workspace process observability — a live read-only view of what is running
in each terminal of the active workspace, with optional resource stats and a
surgical kill that leaves the shell intact. Exposed as
[ExtensionContext.processes](ExtensionContext.md#processes).

The foreground leader, cwd, and idle/busy state update continuously
(every ~750 ms) via the pty-host daemon — no polling needed for that data.
CPU and memory require an explicit opt-in via [ProcessesService.enableStats](#enablestats)
because sysinfo queries have a cost proportional to the number of active
sessions.

## Example

```ts
// Notify when all agents in the workspace are idle.
const sub = ctx.processes.subscribe((procs) => {
  const allIdle = procs.every((p) => p.atPrompt);
  if (allIdle) ctx.ui.notify("info", "All agents finished");
});
ctx.subscriptions.push(sub);

// Enable resource stats for a live process-manager panel.
ctx.subscriptions.push(ctx.processes.enableStats());
```

## Methods

### getState()

```ts
getState(): ProcessInfo[];
```

Defined in: [packages/sdk/src/processes-service.ts:133](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L133)

Current [ProcessInfo](ProcessInfo.md) for every live session in the active workspace.
Only includes sessions that have received at least one foreground update
from the daemon (entries with an unknown leader are omitted).

#### Returns

[`ProcessInfo`](ProcessInfo.md)[]

***

### getByTerminalId()

```ts
getByTerminalId(terminalId): ProcessInfo | undefined;
```

Defined in: [packages/sdk/src/processes-service.ts:143](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L143)

Look up the [ProcessInfo](ProcessInfo.md) for a specific terminal tab by its record
id (e.g. `"term_abc"`). Returns `undefined` until the first foreground
event has been received for that terminal's session.

Convenience shortcut — avoids scanning [ProcessesService.getState](#getstate)
when the caller already has a `terminalId`.

#### Parameters

##### terminalId

`string`

#### Returns

[`ProcessInfo`](ProcessInfo.md) \| `undefined`

***

### subscribe()

```ts
subscribe(listener): Disposable;
```

Defined in: [packages/sdk/src/processes-service.ts:151](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L151)

Subscribe to changes in the active workspace's process list. The listener
is called whenever a leader changes, `atPrompt` flips, a terminal is
added or removed, or a stats tick arrives (if [ProcessesService.enableStats](#enablestats)
is active). Returns a [Disposable](Disposable.md) that cancels the subscription.

#### Parameters

##### listener

(`state`) => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### kill()

```ts
kill(pgid): Promise<void>;
```

Defined in: [packages/sdk/src/processes-service.ts:164](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L164)

Kill a specific foreground process group by pgid — sends `SIGTERM`, then
`SIGKILL` after 3 s if the group is still alive. **Does not destroy the
PTY session** — the shell remains alive and returns to its prompt.

The `pgid` comes from [ProcessInfo.pgid](ProcessInfo.md#pgid). Killing a shell's own pgid
(when `atPrompt` is `true`) would close the terminal; guard against that if
needed.

Requires the `"process"` [Permission](../type-aliases/Permission.md) for third-party extensions.

#### Parameters

##### pgid

`number`

#### Returns

`Promise`\<`void`\>

***

### enableStats()

```ts
enableStats(options?): Disposable;
```

Defined in: [packages/sdk/src/processes-service.ts:181](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L181)

Enable CPU + memory polling for all sessions in the active workspace.
Returns a [Disposable](Disposable.md) — **dispose it when done** to stop polling and
remove `stats` (and `tree`) from all [ProcessInfo](ProcessInfo.md) objects.

With `{ trees: true }`, each [ProcessInfo](ProcessInfo.md) additionally carries the
descendant process tree rooted at its foreground leader (see
[ProcessInfo.tree](ProcessInfo.md#tree)) — built host-side from one shared process-table
scan per tick, so it costs the same no matter how many extensions ask.

Multiple callers share one poll loop (refcounted); the loop stops only when
the last disposable is released. Polling interval is ~1500 ms.

CPU% is `0` on the first sample; values stabilize after ~3 s.

#### Parameters

##### options?

###### trees?

`boolean`

#### Returns

[`Disposable`](Disposable.md)
