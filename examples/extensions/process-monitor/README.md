# process-monitor

Example extension demonstrating the `ctx.processes` API surface.

## What it shows

| API                               | Where used                                                 |
| --------------------------------- | ---------------------------------------------------------- |
| `ctx.processes.getState()`        | `useServiceState(ctx.processes)` in the panel + status bar |
| `ctx.processes.subscribe()`       | via `useServiceState` under the hood                       |
| `ctx.processes.getByTerminalId()` | not used directly here — see the API docs for its use case |
| `ctx.processes.kill(pgid)`        | Kill button in each process row                            |
| `ctx.processes.enableStats()`     | "Stats on/off" toggle in the panel toolbar                 |

## What it contributes

**Process Monitor side panel** (right column) — one row per terminal in the active workspace showing:

- Status dot (accent = running, grey = idle at prompt)
- Terminal name (click to focus that terminal)
- Foreground process name + shortened working directory
- CPU% and memory when stats are enabled (first sample is 0%; stabilizes after ~3 s)
- Kill button (× ) when a process is running — sends SIGTERM, then SIGKILL after 3 s; the shell stays alive

**Status bar item** (right side) — shows `N running` in accent color when processes are active, or `idle` when all terminals are at a prompt.

## Building

```sh
node build.mjs
```

The built `dist/index.js` is automatically synced to the dev app's extension directory if it's already installed there.

## Installing in the dev app

In the running Silo Dev app, open **Settings → Extensions → Install from folder** and point it at this directory. The extension id is `silo.process-monitor`.

It declares the `"process"` permission (required for `kill()`).
