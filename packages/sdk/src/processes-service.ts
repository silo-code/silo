import type { Disposable } from "./types";

// `ctx.processes` — workspace process observability: what's running in each
// terminal, its resource usage, and surgical kill without destroying the PTY
// session. The companion to `ctx.process` (which spawns/attaches sessions).
// The public contract lives here; the host implementation is in the host package.

/**
 * Resource snapshot for the foreground leader of a PTY session. Only present
 * on a {@link ProcessInfo} when an extension has called
 * {@link ProcessesService.enableStats}.
 *
 * CPU% is a delta between consecutive samples (the first sample after calling
 * `enableStats` returns 0%; values stabilize after the second poll ~3 s later).
 *
 * @category Consumer Services
 * @public
 */
export interface ProcessStats {
  /** The process id of the foreground leader (same as {@link ProcessInfo.pgid} by convention). */
  pid: number;
  /** CPU percentage used since the previous sample, per-core (not system-wide total). */
  cpuPercent: number;
  /** Resident memory in megabytes. */
  memoryMb: number;
}

/**
 * Live view of what is currently running in one PTY session — the foreground
 * process group as reported by the pty-host daemon every ~750 ms.
 *
 * Returned by {@link ProcessesService.getState} and
 * {@link ProcessesService.getByTerminalId}; delivered to
 * {@link ProcessesService.subscribe} listeners on every change.
 *
 * @category Consumer Services
 * @public
 */
export interface ProcessInfo {
  /** The underlying PTY session id — stable across app restarts. */
  readonly sessionId: string;
  /**
   * The terminal tab record id (e.g. `"term_abc"`) when this session is backed
   * by a visible terminal tab. `undefined` only for headless sessions created
   * directly via {@link ProcessService.spawn}. Use to correlate with
   * `ctx.terminals` or to call `ctx.terminals.focus(terminalId)`.
   */
  readonly terminalId?: string;
  /**
   * Display title of the terminal tab — matches the tab label the user sees
   * (`customName ?? title` from the terminal record). Undefined for headless
   * sessions.
   */
  readonly terminalTitle?: string;
  /**
   * Foreground process-group id — the group the PTY is currently routing input
   * to. Equals the PID of the group leader (by Unix convention).
   */
  readonly pgid: number;
  /** Name of the foreground program (e.g. `"node"`, `"vim"`, `"-zsh"`). */
  readonly leader: string;
  /** Working directory of the foreground leader (`""` if unknown). */
  readonly cwd: string;
  /** `true` when the foreground group is the shell itself — i.e. idle at a prompt. */
  readonly atPrompt: boolean;
  /**
   * CPU and memory snapshot. Only present while at least one extension has
   * called {@link ProcessesService.enableStats} and held its {@link Disposable}.
   * Absent otherwise (no polling overhead when nobody needs it).
   */
  readonly stats?: ProcessStats;
}

/**
 * Workspace process observability — a live read-only view of what is running
 * in each terminal of the active workspace, with optional resource stats and a
 * surgical kill that leaves the shell intact. Exposed as
 * {@link ExtensionContext.processes}.
 *
 * The foreground leader, cwd, and idle/busy state update continuously
 * (every ~750 ms) via the pty-host daemon — no polling needed for that data.
 * CPU and memory require an explicit opt-in via {@link ProcessesService.enableStats}
 * because sysinfo queries have a cost proportional to the number of active
 * sessions.
 *
 * @example
 * ```ts
 * // Notify when all agents in the workspace are idle.
 * const sub = ctx.processes.subscribe((procs) => {
 *   const allIdle = procs.every((p) => p.atPrompt);
 *   if (allIdle) ctx.ui.notify("info", "All agents finished");
 * });
 * ctx.subscriptions.push(sub);
 *
 * // Enable resource stats for a live process-manager panel.
 * ctx.subscriptions.push(ctx.processes.enableStats());
 * ```
 *
 * @category Consumer Services
 * @public
 */
export interface ProcessesService {
  /**
   * Current {@link ProcessInfo} for every live session in the active workspace.
   * Only includes sessions that have received at least one foreground update
   * from the daemon (entries with an unknown leader are omitted).
   */
  getState(): ProcessInfo[];

  /**
   * Look up the {@link ProcessInfo} for a specific terminal tab by its record
   * id (e.g. `"term_abc"`). Returns `undefined` until the first foreground
   * event has been received for that terminal's session.
   *
   * Convenience shortcut — avoids scanning {@link ProcessesService.getState}
   * when the caller already has a `terminalId`.
   */
  getByTerminalId(terminalId: string): ProcessInfo | undefined;

  /**
   * Subscribe to changes in the active workspace's process list. The listener
   * is called whenever a leader changes, `atPrompt` flips, a terminal is
   * added or removed, or a stats tick arrives (if {@link ProcessesService.enableStats}
   * is active). Returns a {@link Disposable} that cancels the subscription.
   */
  subscribe(listener: (state: ProcessInfo[]) => void): Disposable;

  /**
   * Kill a specific foreground process group by pgid — sends `SIGTERM`, then
   * `SIGKILL` after 3 s if the group is still alive. **Does not destroy the
   * PTY session** — the shell remains alive and returns to its prompt.
   *
   * The `pgid` comes from {@link ProcessInfo.pgid}. Killing a shell's own pgid
   * (when `atPrompt` is `true`) would close the terminal; guard against that if
   * needed.
   *
   * Requires the `"process"` {@link Permission} for third-party extensions.
   */
  kill(pgid: number): Promise<void>;

  /**
   * Enable CPU + memory polling for all sessions in the active workspace.
   * Returns a {@link Disposable} — **dispose it when done** to stop polling and
   * remove `stats` from all {@link ProcessInfo} objects.
   *
   * Multiple callers share one poll loop (refcounted); the loop stops only when
   * the last disposable is released. Polling interval is ~1500 ms.
   *
   * CPU% is `0` on the first sample; values stabilize after ~3 s.
   */
  enableStats(): Disposable;
}
