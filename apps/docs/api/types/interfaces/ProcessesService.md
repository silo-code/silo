# Interface: ProcessesService

Defined in: [packages/sdk/src/processes-service.ts:102](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L102)

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

Defined in: [packages/sdk/src/processes-service.ts:108](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L108)

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

Defined in: [packages/sdk/src/processes-service.ts:118](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L118)

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

Defined in: [packages/sdk/src/processes-service.ts:126](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L126)

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

Defined in: [packages/sdk/src/processes-service.ts:139](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L139)

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
enableStats(): Disposable;
```

Defined in: [packages/sdk/src/processes-service.ts:151](https://github.com/silo-code/silo/blob/main/packages/sdk/src/processes-service.ts#L151)

Enable CPU + memory polling for all sessions in the active workspace.
Returns a [Disposable](Disposable.md) — **dispose it when done** to stop polling and
remove `stats` from all [ProcessInfo](ProcessInfo.md) objects.

Multiple callers share one poll loop (refcounted); the loop stops only when
the last disposable is released. Polling interval is ~1500 ms.

CPU% is `0` on the first sample; values stabilize after ~3 s.

#### Returns

[`Disposable`](Disposable.md)
