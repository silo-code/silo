import { invoke } from "@tauri-apps/api/core";
import { tauriTerminalClient } from "../services/tauri-terminal-client";
import { store } from "../state/store";
import { PathDeniedError } from "@silo-code/sdk";
import { abortError } from "./abort";
import { toAbsolute, withinRoots } from "./security/resolve-path";
import type { PathScope } from "./security/resolve-path";
import type {
  ProcessService,
  ProcessSession,
  ProcessExecResult,
  ProcessExecOptions,
} from "@silo-code/sdk";

// Monotonic id per exec that needs cancellation — handed to `process_exec` so
// `process_exec_kill` can target its process group on timeout/abort.
let execSeq = 0;

/**
 * Run `process_exec`, layering `timeoutMs` / `signal` cancellation on top: the
 * caller's promise rejects with an AbortError the moment either fires, and the
 * still-running child (and its process group) is killed via `process_exec_kill`.
 * The native invocation is allowed to settle in the background and is discarded.
 */
function execWithCancellation(
  command: string,
  args: string[],
  options: ProcessExecOptions | undefined,
): Promise<ProcessExecResult> {
  const { cwd, env, timeoutMs, signal } = options ?? {};
  const needsKill = timeoutMs !== undefined || signal !== undefined;
  const execId = needsKill ? `exec_${++execSeq}` : undefined;
  const args_ = { command, args, cwd, env, execId };

  if (!needsKill) return invoke<ProcessExecResult>("process_exec", args_);
  if (signal?.aborted) return Promise.reject(abortError("exec was aborted"));

  return new Promise<ProcessExecResult>((resolve, reject) => {
    let done = false;
    const cleanups: Array<() => void> = [];
    const runCleanups = () => cleanups.forEach((c) => c());

    const abort = (message: string) => {
      if (done) return;
      done = true;
      runCleanups();
      void invoke("process_exec_kill", { execId }).catch(() => {});
      reject(abortError(message));
    };

    if (signal) {
      const onAbort = () => abort("exec was aborted");
      signal.addEventListener("abort", onAbort, { once: true });
      cleanups.push(() => signal.removeEventListener("abort", onAbort));
    }
    if (timeoutMs !== undefined) {
      const timer = setTimeout(
        () => abort(`exec timed out after ${timeoutMs} ms`),
        timeoutMs,
      );
      cleanups.push(() => clearTimeout(timer));
    }

    invoke<ProcessExecResult>("process_exec", args_).then(
      (result) => {
        if (done) return;
        done = true;
        runCleanups();
        resolve(result);
      },
      (err) => {
        if (done) return;
        done = true;
        runCleanups();
        reject(err);
      },
    );
  });
}

/**
 * The configured shell command from terminal settings. A leading empty string
 * means "the daemon's $SHELL"; undefined → the daemon's default login shell.
 */
function shellCommand(): string[] | undefined {
  const shell = store.terminalSettings.shell.trim();
  const args = store.terminalSettings.shellArgs.trim();
  const argv = args ? args.split(/\s+/) : [];
  if (!shell && argv.length === 0) return undefined;
  return [shell, ...argv];
}

// `ctx.process` — persistent process / PTY sessions that survive app restarts.
// The core primitive under the terminal (and future task runners / REPLs). It
// wraps the self-owned PTY session host (a daemon Silo owns); sessions are shell
// PTYs. See docs/architecture-audit/ctx-domains.md → "Persistent process sessions".
// The public contract lives in @silo-code/sdk (process-service.ts).

function makeSession(id: string): ProcessSession {
  return {
    id,
    write: (data) => tauriTerminalClient.sendInput(id, data),
    resize: (cols, rows) => {
      void tauriTerminalClient.resizeTerminal(id, cols, rows).catch(() => {});
    },
    kill: () => tauriTerminalClient.deleteTerminal(id),
    getBuffer: () => tauriTerminalClient.getTerminalBuffer(id),
    saveBuffer: (data) => tauriTerminalClient.saveTerminalBuffer(id, data),
    onData: (listener) => ({
      dispose: tauriTerminalClient.onOutput(id, listener),
    }),
    onExit: (listener) => ({
      dispose: tauriTerminalClient.onExit(id, listener),
    }),
  };
}

let service: ProcessService | null = null;

/** @internal — host factory; extensions receive this as `ctx.process`. */
export function getProcessService(): ProcessService {
  if (service) return service;
  service = {
    async spawn(opts) {
      const { sessionId } = await tauriTerminalClient.createTerminal({
        ...opts,
        command: shellCommand(),
      });
      return makeSession(sessionId);
    },
    async attach(id, opts) {
      await tauriTerminalClient.attachTerminal(id, opts);
      return makeSession(id);
    },
    exec(command, args, options) {
      return execWithCancellation(command, args, options);
    },
  };
  return service;
}

/**
 * Resolve and check a working directory against `scope`. Defaults to the primary
 * workspace root when unset; a cwd outside the workspace is allowed only with the
 * `process` capability. Throws {@link PathDeniedError} otherwise.
 */
function guardCwd(scope: PathScope, cwd: string | undefined): string {
  const target = cwd ?? scope.roots[0];
  if (target === undefined) {
    throw new PathDeniedError(cwd ?? "", "No workspace is open");
  }
  if (scope.permissions.has("process")) return target;
  const abs = toAbsolute(scope.roots, target);
  if (abs !== null && withinRoots(scope.roots, abs)) return abs;
  throw new PathDeniedError(
    target,
    `Working directory is outside the workspace (needs "process"): ${target}`,
  );
}

/**
 * Wrap a {@link ProcessService} so a session's / command's working directory is
 * scoped to the workspace (lifted by the `process` capability). The command and
 * its arguments are not constrained — cwd is the enforceable knob in-process.
 * Trusted scopes return the base service unchanged. Pure over `base` for testing.
 *
 * @internal
 */
export function scopeProcessService(
  base: ProcessService,
  scope: PathScope,
): ProcessService {
  if (scope.trusted) return base;
  // `async` so a denied cwd surfaces as a rejected promise, not a sync throw.
  return {
    spawn: async (opts) =>
      base.spawn({ ...opts, cwd: guardCwd(scope, opts.cwd) }),
    attach: (id, opts) => base.attach(id, opts),
    exec: async (command, args, options) =>
      base.exec(command, args, {
        ...options,
        cwd: guardCwd(scope, options?.cwd),
      }),
  };
}

/** @internal — the per-extension scoped `ctx.process`. */
export function getScopedProcessService(scope: PathScope): ProcessService {
  return scopeProcessService(getProcessService(), scope);
}
