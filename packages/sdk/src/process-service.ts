import type { Disposable } from "./types";

// `ctx.process` — persistent process / PTY sessions that survive app restarts.
// The core primitive under the terminal (and future task runners / REPLs).

/**
 * Options for spawning a process session. Today sessions are shell PTYs, so
 * `cwd` is required (the webview has no ambient working directory).
 *
 * @category Consumer Services
 * @public
 */
export interface ProcessSpawnOptions {
  /**
   * Working directory the session starts in. Must resolve inside the open
   * workspace unless the extension declared the `process` {@link Permission}
   * (first-party extensions are unscoped); otherwise throws
   * {@link PathDeniedError}.
   */
  cwd: string;
  /** Initial column count. */
  cols?: number;
  /** Initial row count. */
  rows?: number;
  /**
   * Extra environment variables, **merged over** the session's inherited
   * environment. Use it for things a long-lived shell needs from the start —
   * `NO_COLOR`, a locale, a tool's config directory — without clobbering
   * `PATH`.
   *
   * Keys beginning `SILO_` (and the bare `SILO`) are **reserved by the host**
   * and are dropped: Silo stamps its own
   * {@link https://getsilo.dev/api/terminal-environment | terminal identity}
   * there, and a guard keyed on a value any caller could write would be no
   * guard at all. Dropped keys are logged to the Extension Host output channel.
   */
  env?: Record<string, string>;
}

/**
 * A live handle to one persistent process session, returned by
 * {@link ProcessService.spawn} / {@link ProcessService.attach}. The underlying
 * session **survives app restarts** — re-`attach` by {@link ProcessSession.id}
 * to reconnect to a still-running session.
 *
 * @category Consumer Services
 * @public
 */
export interface ProcessSession {
  /** Stable session id; pass to {@link ProcessService.attach} to reconnect. */
  readonly id: string;
  /** Write input to the session (e.g. keystrokes). */
  write(data: string): void;
  /** Notify the session its viewport size changed. */
  resize(cols: number, rows: number): void;
  /** Terminate the session and release it. */
  kill(): Promise<void>;
  /** Fetch the persisted output buffer (to restore a view after re-attach). */
  getBuffer(): Promise<string>;
  /** Persist an output buffer for later restore. */
  saveBuffer(data: string): Promise<void>;
  /** Subscribe to output data. Dispose to stop listening. */
  onData(listener: (data: string) => void): Disposable;
  /** Subscribe to session exit. Dispose to stop listening. */
  onExit(listener: (exitCode: number) => void): Disposable;
}

/**
 * Options for {@link ProcessService.exec}.
 *
 * @category Consumer Services
 * @public
 */
export interface ProcessExecOptions {
  /**
   * Working directory to run the command in. Defaults to the open **workspace
   * folder** when omitted — the right cwd for CLI tools (git, formatters,
   * linters) that operate on a repo. A `cwd` outside the workspace throws
   * {@link PathDeniedError} unless the extension declared the `process`
   * {@link Permission}. First-party (bundled) extensions are unscoped.
   */
  cwd?: string;
  /**
   * Extra environment variables, **merged over** the host's environment (the
   * command inherits the host env; these keys add to or override it). Use it to
   * set things like `GIT_PAGER=cat` or a locale without clobbering `PATH`.
   *
   * Keys beginning `SILO_` (and the bare `SILO`) are **reserved by the host**
   * and are dropped — same rule as
   * {@link ProcessSpawnOptions.env}, so the reservation can't be sidestepped
   * by launching through `exec` instead of `spawn`.
   */
  env?: Record<string, string>;
  /**
   * Kill the process and reject after this many milliseconds. The whole process
   * group is terminated (not just the direct child), so shell wrappers don't
   * leak orphans. The rejection is an `Error` whose `name` is `"AbortError"`.
   */
  timeoutMs?: number;
  /**
   * Abort handle. Aborting kills the process (and its group) and rejects the
   * `exec` promise with an `Error` whose `name` is `"AbortError"` — the same
   * shape as a `timeoutMs` expiry, so callers branch on `err.name`.
   */
  signal?: AbortSignal;
}

/**
 * The captured result of a one-shot subprocess, returned by
 * {@link ProcessService.exec}.
 *
 * @category Consumer Services
 * @public
 */
export interface ProcessExecResult {
  /** Everything the command wrote to standard output. */
  stdout: string;
  /** Everything the command wrote to standard error. */
  stderr: string;
  /**
   * The process exit code (`0` conventionally means success), or `-1` if the
   * process was terminated by a signal. A non-zero `code` is **not** an error —
   * `exec` resolves regardless; inspect `code`/`stderr` to decide.
   */
  code: number;
}

/**
 * Persistent process / PTY sessions that **survive app restarts** — the core
 * primitive under the terminal (and future task runners, REPLs) — plus one-shot
 * {@link ProcessService.exec | exec} for fire-and-forget subprocess execution.
 * Exposed as {@link ExtensionContext.process}.
 *
 * @category Consumer Services
 * @public
 */
export interface ProcessService {
  /** Spawn a new session in `opts.cwd`. */
  spawn(opts: ProcessSpawnOptions): Promise<ProcessSession>;
  /**
   * Re-attach to an existing session by id (e.g. after an app restart). Rejects
   * with a 404-style error if the session no longer exists.
   */
  attach(
    id: string,
    opts?: { cols?: number; rows?: number },
  ): Promise<ProcessSession>;
  /**
   * Run a one-shot command and resolve with its captured output — for
   * extensions that wrap a CLI (git, formatters, linters) rather than drive an
   * interactive shell. Use {@link ProcessService.spawn | spawn} for long-lived
   * interactive sessions instead.
   *
   * Runs **off the UI thread**, so a slow or network-bound command never
   * stutters the app. The returned promise rejects if the process could not be
   * spawned (e.g. the command was not found), or if a
   * {@link ProcessExecOptions.timeoutMs | timeout} / {@link ProcessExecOptions.signal | abort}
   * fires (an `Error` with `name === "AbortError"`); a command that runs to
   * completion but exits non-zero **resolves** — check
   * {@link ProcessExecResult.code} and {@link ProcessExecResult.stderr}.
   *
   * @param command - Executable to run (resolved via `PATH`), e.g. `"git"`.
   * @param args - Arguments passed verbatim — not shell-interpreted, so no
   *   quoting/escaping concerns and no shell-injection surface.
   * @param options - Optional {@link ProcessExecOptions} (e.g. `cwd`).
   * @example
   * ```ts
   * const { stdout, code } = await ctx.process.exec(
   *   "git",
   *   ["status", "--porcelain=v2"],
   *   { cwd: workspaceFolder },
   * );
   * if (code === 0) parseStatus(stdout);
   * ```
   */
  exec(
    command: string,
    args: string[],
    options?: ProcessExecOptions,
  ): Promise<ProcessExecResult>;
}
