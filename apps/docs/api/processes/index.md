# ctx.processes <Badge type="tip" text="stable" />

Live process observability for the active workspace — what is running in each
terminal, its cwd and idle/busy state, optional CPU + memory stats, and a
surgical kill that leaves the shell alive. The companion to
[`ctx.process`](/api/process/) (which spawns and attaches sessions); this
surface is for reading and controlling what is already running.

```ts
ctx.processes: ProcessesService
```

## Example

### Idle detection — fire when all agents finish

```ts
export const extension: Extension = {
  id: "my.idle-notifier",
  activate(ctx) {
    const sub = ctx.processes.subscribe((procs) => {
      const allIdle = procs.length > 0 && procs.every((p) => p.atPrompt);
      if (allIdle) ctx.ui.notify({ title: "All terminals idle" });
    });
    ctx.subscriptions.push(sub);
  },
};
```

### Process manager panel with resource stats

```tsx
export const extension: Extension = {
  id: "my.process-manager",
  activate(ctx) {
    // Enable stats while the extension is active.
    ctx.subscriptions.push(ctx.processes.enableStats());

    ctx.registerSidePanel({
      id: "my.process-manager.panel",
      title: "Processes",
      render() {
        const [procs, setProcs] = useState<ProcessInfo[]>(() =>
          ctx.processes.getState(),
        );
        useEffect(() => {
          const sub = ctx.processes.subscribe(setProcs);
          return () => sub.dispose();
        }, []);

        return (
          <ul>
            {procs.map((p) => (
              <li key={p.sessionId}>
                <span>{p.terminalTitle ?? p.sessionId}</span>
                <span>{p.leader}</span>
                {p.stats && (
                  <span>
                    {p.stats.cpuPercent.toFixed(1)}% ·{" "}
                    {p.stats.memoryMb.toFixed(0)} MB
                  </span>
                )}
                {!p.atPrompt && (
                  <button onClick={() => ctx.processes.kill(p.pgid)}>
                    Kill
                  </button>
                )}
              </li>
            ))}
          </ul>
        );
      },
    });
  },
};
```

### CWD tracking — sync editor breadcrumb to active terminal

```ts
// Know the foreground cwd of whatever's running, without reading the shell prompt.
const sub = ctx.processes.subscribe((procs) => {
  const active = procs.find((p) => !p.atPrompt);
  if (active) updateBreadcrumb(active.cwd);
});
```

## Methods

**`ProcessesService`** (`ctx.processes`):

| Method                                                                              | What it does                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`getState(options?)`](/api/types/interfaces/ProcessesService#getState)             | Current [`ProcessInfo[]`](/api/types/interfaces/ProcessInfo) for the active workspace (sessions with a known leader). Pass `{ allWorkspaces: true }` for every loaded workspace.                   |
| [`getByTerminalId(id)`](/api/types/interfaces/ProcessesService#getByTerminalId)     | Look up by terminal tab id — shortcut to avoid scanning `getState()`. Spans all loaded workspaces (terminal ids are unique).                                                                       |
| [`subscribe(listener, options?)`](/api/types/interfaces/ProcessesService#subscribe) | Observe changes (leader flip, atPrompt change, stats tick, tab add/remove). Pass `{ allWorkspaces: true }` to observe every workspace. Returns a [`Disposable`](/api/types/interfaces/Disposable). |
| [`kill(pgid)`](/api/types/interfaces/ProcessesService#kill)                         | Send SIGTERM → SIGKILL (after 3 s) to the process group. Shell stays alive.                                                                                                                        |
| [`enableStats()`](/api/types/interfaces/ProcessesService#enableStats)               | Start CPU + memory polling (~1500 ms). Returns a `Disposable`; dispose to stop.                                                                                                                    |

**[`ProcessInfo`](/api/types/interfaces/ProcessInfo)** fields:

| Field           | Type                                                                | What it means                                                                                     |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `sessionId`     | `string`                                                            | Stable PTY session id.                                                                            |
| `workspaceId`   | `string`                                                            | Workspace the session belongs to — group/filter results from `getState({ allWorkspaces: true })`. |
| `terminalId`    | `string \| undefined`                                               | Terminal tab id (e.g. `"term_abc"`); `undefined` for headless sessions.                           |
| `terminalTitle` | `string \| undefined`                                               | Label shown on the terminal tab (`customName ?? title`).                                          |
| `pgid`          | `number`                                                            | Foreground process-group id (== leader PID by Unix convention).                                   |
| `leader`        | `string`                                                            | Program name (`"node"`, `"vim"`, `"-zsh"`, …).                                                    |
| `cwd`           | `string`                                                            | Working directory of the foreground leader.                                                       |
| `atPrompt`      | `boolean`                                                           | `true` when the shell is idle (no foreground program running).                                    |
| `stats`         | [`ProcessStats`](/api/types/interfaces/ProcessStats) \| `undefined` | CPU + memory (only when `enableStats()` is active).                                               |

### Cross-workspace badges — count busy terminals per workspace in a sidebar

```ts
// procs spans every loaded workspace; group by workspaceId for per-workspace badges.
const sub = ctx.processes.subscribe(
  (procs) => {
    const busyByWorkspace = new Map<string, number>();
    for (const p of procs) {
      if (!p.atPrompt) {
        busyByWorkspace.set(
          p.workspaceId,
          (busyByWorkspace.get(p.workspaceId) ?? 0) + 1,
        );
      }
    }
    updateSidebarBadges(busyByWorkspace);
  },
  { allWorkspaces: true },
);
ctx.subscriptions.push(sub);
```

## Correlating with ctx.terminals

`terminalId` is the same id that `ctx.terminals` uses:

```ts
// Focus the terminal whose process is eating CPU.
const heavy = procs.find((p) => (p.stats?.cpuPercent ?? 0) > 80);
if (heavy?.terminalId) ctx.terminals.focus(heavy.terminalId);
```

Or look up the inverse — given a terminal tab id, get its process:

```ts
const proc = ctx.processes.getByTerminalId(terminalId);
if (proc && !proc.atPrompt) console.log(`Running: ${proc.leader}`);
```

## Stats notes {#stats-notes}

- Stats are **off by default** — no sysinfo overhead unless `enableStats()` is called.
- Multiple callers share one poll loop (refcounted); the loop stops when the last disposable is released.
- **First sample returns `cpuPercent: 0`**; values stabilize after the second poll (~3 s). This is inherent to how `/proc/stat`-based CPU accounting works — a delta between two samples is required.
- `memoryMb` is the resident set size (RSS) in MB.

## Permissions {#permissions}

`getState()`, `getByTerminalId()`, and `subscribe()` are unrestricted — foreground
info is observable by any extension. `kill()` requires the `"process"`
[`Permission`](/api/types/type-aliases/Permission) for third-party extensions (the
same permission that gates `ctx.process.spawn()` outside the workspace). Declare
it in your extension manifest if you need kill capability.

## Types

[`ProcessesService`](/api/types/interfaces/ProcessesService) ·
[`ProcessInfo`](/api/types/interfaces/ProcessInfo) ·
[`ProcessStats`](/api/types/interfaces/ProcessStats).
