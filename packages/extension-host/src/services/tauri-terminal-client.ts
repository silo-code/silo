import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { OscEvent } from "@silo-code/sdk";

type OutputListener = (data: string) => void;
type ExitListener = (exitCode: number) => void;
type OscListener = (event: OscEvent) => void;

interface CreateOpts {
  cwd: string;
  cols?: number;
  rows?: number;
  /** Program + args to run; undefined → the daemon's default login shell. */
  command?: string[];
  /**
   * Environment for the session, already assembled by the host (identity
   * stamped, reserved keys stripped — see `session-env.ts`). Merged over the
   * daemon's inherited environment in the forkpty child.
   */
  env?: Record<string, string>;
}

interface AttachOpts {
  cols?: number;
  rows?: number;
}

export class TauriTerminalClient {
  private outputListeners = new Map<string, Set<OutputListener>>();
  private exitListeners = new Map<string, Set<ExitListener>>();
  private oscListeners = new Map<string, Set<OscListener>>();
  private unlisteners = new Map<string, Array<() => void>>();
  // Tracks sessions whose Tauri event bridge is currently being set up. Guards
  // against concurrent calls to setupSessionListeners (e.g. onOsc + onOutput
  // firing synchronously for the same new session) registering duplicate bridges
  // before the first async listen() call has a chance to set `unlisteners`.
  private setupInProgress = new Set<string>();

  async createTerminal(opts: CreateOpts): Promise<{ sessionId: string }> {
    // `process` doesn't exist in the webview; callers pass an explicit cwd.
    const cwd = opts.cwd || "/";
    const cols = opts.cols ?? 120;
    const rows = opts.rows ?? 40;

    const sessionId = await invoke<string>("terminal_create", {
      cwd,
      cols,
      rows,
      command: opts.command,
      env: opts.env,
    });

    await this.setupSessionListeners(sessionId);

    return { sessionId };
  }

  async attachTerminal(
    sessionId: string,
    opts: AttachOpts = {},
  ): Promise<{ sessionId: string }> {
    const cols = opts.cols ?? 120;
    const rows = opts.rows ?? 40;

    try {
      await invoke("terminal_attach", {
        sessionId,
        cols,
        rows,
      });

      await this.setupSessionListeners(sessionId);

      return { sessionId };
    } catch (err) {
      // The backend returns "SESSION_GONE" when the persistent session no longer
      // exists. Normalize it to a 404-style error so the panel shows the clear
      // "session no longer exists" state instead of a fabricated process exit.
      if (typeof err === "string" && err.includes("SESSION_GONE")) {
        // Durable breadcrumb before the panel's ui_attach_gone / recreate path.
        void invoke("terminal_diag_log", {
          event: "ui_attach_gone",
          detail: `sessionId=${sessionId} source=tauri-client err=SESSION_GONE`,
        }).catch(() => {});
        const e = new Error("Terminal session no longer exists.") as Error & {
          status?: number;
        };
        e.status = 404;
        throw e;
      }
      void invoke("terminal_diag_log", {
        event: "ui_attach_fail",
        detail: `sessionId=${sessionId} source=tauri-client err=${
          typeof err === "string"
            ? err
            : ((err as Error)?.message ?? String(err))
        }`,
      }).catch(() => {});
      throw err;
    }
  }

  private async setupSessionListeners(sessionId: string): Promise<void> {
    // The Tauri event bridge for a session must exist only once. On HMR (or any
    // re-attach to a still-alive session) the component re-runs attachTerminal;
    // registering a second bridge here would make every output event fire twice,
    // doubling the on-screen echo. Per-component callbacks are tracked separately
    // via onOutput/onExit, so it's safe to reuse the existing bridge.
    if (this.unlisteners.has(sessionId)) return;
    // Synchronous in-progress guard: prevents a second concurrent call from
    // also passing the unlisteners check above before the first await resolves.
    // Without this, onOsc + onOutput called back-to-back for a new session both
    // start setup before either finishes, registering two Tauri event bridges.
    if (this.setupInProgress.has(sessionId)) return;
    this.setupInProgress.add(sessionId);

    try {
      // Listen for output events from this session
      const unlistenOutput = await listen<string>(
        `terminal_output:${sessionId}`,
        (event) => {
          const listeners = this.outputListeners.get(sessionId);
          listeners?.forEach((cb) => cb(event.payload));
          // Parse and dispatch any OSC sequences in this chunk.
          // Checked on every chunk so OSC listeners registered after setup
          // (e.g. from subscribeOsc) are picked up immediately.
          const oscListeners = this.oscListeners.get(sessionId);
          if (oscListeners?.size) {
            parseOscSequences(event.payload, (osc) =>
              oscListeners.forEach((cb) => cb(osc)),
            );
          }
        },
      );

      // Listen for exit events from this session
      const unlistenExit = await listen<number>(
        `terminal_exit:${sessionId}`,
        (event) => {
          const listeners = this.exitListeners.get(sessionId);
          listeners?.forEach((cb) => cb(event.payload));
          // Clean up listeners for this session
          this.cleanup(sessionId);
        },
      );

      if (!this.unlisteners.has(sessionId)) {
        this.unlisteners.set(sessionId, []);
      }
      this.unlisteners.get(sessionId)!.push(unlistenOutput, unlistenExit);
    } finally {
      this.setupInProgress.delete(sessionId);
    }
  }

  async deleteTerminal(sessionId: string): Promise<void> {
    await invoke("terminal_kill", { sessionId });
    this.cleanup(sessionId);
  }

  async resizeTerminal(
    sessionId: string,
    cols: number,
    rows: number,
  ): Promise<void> {
    await invoke("terminal_resize", {
      sessionId,
      cols,
      rows,
    });
  }

  /** Fetch the persisted serialized buffer (xterm SerializeAddon output). */
  async getTerminalBuffer(sessionId: string): Promise<string> {
    try {
      return await invoke<string>("terminal_get_buffer", { sessionId });
    } catch (err) {
      console.warn("Failed to get terminal buffer:", err);
      return "";
    }
  }

  /** Persist a serialized terminal buffer for later restore. Fire-and-forget. */
  async saveTerminalBuffer(sessionId: string, data: string): Promise<void> {
    try {
      await invoke("terminal_save_buffer", { sessionId, data });
    } catch (err) {
      console.warn("Failed to save terminal buffer:", err);
    }
  }

  sendInput(sessionId: string, data: string): void {
    const bytes = [...new TextEncoder().encode(data)];
    invoke("terminal_write", {
      sessionId,
      data: bytes,
    }).catch(() => {
      // Silently ignore write errors
    });
  }

  sendResize(_sessionId: string, _cols: number, _rows: number): void {
    // Fire-and-forget resize notification (no-op for local PTY)
  }

  joinTerminal(_sessionId: string): void {
    // Register session interest (no-op for local PTY)
  }

  leaveTerminal(_sessionId: string): void {
    // Unregister session interest (no-op for local PTY)
  }

  /**
   * Begin delivering this session's output: start the backend reader thread,
   * then establish the Tauri event bridge.
   *
   * **Every** output-derived subscription must call this, not just `onOutput`.
   * On Unix the reader thread starts in `terminal_create`, so the invoke is a
   * no-op and forgetting it costs nothing. On Windows the reader is deliberately
   * deferred until `terminal_start_stream` (the blank-canvas race — cmd.exe
   * emits its banner in ~5 ms, before JS `listen()` completes), so a subscriber
   * that skips it registers a listener for a stream that never starts. That is
   * invisible on macOS and total on Windows, which is exactly how `onOsc` came
   * to silently deliver nothing there.
   *
   * Fire-and-forget and safe to repeat — the Rust side is idempotent
   * (`AtomicBool` swap).
   */
  private beginOutputStream(sessionId: string): void {
    invoke("terminal_start_stream", { sessionId }).catch(() => {});
    // Without this, callers that subscribe before the terminal panel mounts
    // (e.g. ctx.terminals.subscribeOutput) would never receive events.
    this.setupSessionListeners(sessionId).catch(() => {});
  }

  onOutput(sessionId: string, cb: OutputListener): () => void {
    let set = this.outputListeners.get(sessionId);
    if (!set) {
      // First listener for this session — start the stream before the callback
      // can miss anything.
      set = new Set();
      this.outputListeners.set(sessionId, set);
      this.beginOutputStream(sessionId);
    }
    set.add(cb);
    return () => {
      const s = this.outputListeners.get(sessionId);
      s?.delete(cb);
      if (s && s.size === 0) this.outputListeners.delete(sessionId);
    };
  }

  onExit(sessionId: string, cb: ExitListener): () => void {
    let set = this.exitListeners.get(sessionId);
    if (!set) {
      set = new Set();
      this.exitListeners.set(sessionId, set);
      // Exit is emitted by the same reader loop as output (terminal_io.rs), so
      // a caller that subscribes only to exit — e.g. an extension driving a
      // `ctx.process.spawn` session it doesn't render — still needs the reader
      // running, or on Windows it would never learn the process ended.
      this.beginOutputStream(sessionId);
    }
    set.add(cb);
    return () => {
      const s = this.exitListeners.get(sessionId);
      s?.delete(cb);
      if (s && s.size === 0) this.exitListeners.delete(sessionId);
    };
  }

  /**
   * Subscribe to parsed OSC sequences from a PTY session. The callback fires
   * for every OSC sequence in the raw output stream — including when the
   * terminal's UI panel is not mounted. Returns an unsubscribe function.
   *
   * Calling onOsc also ensures the Tauri event bridge is established for this
   * session, so OSC events fire even before the terminal panel mounts.
   */
  onOsc(sessionId: string, cb: OscListener): () => void {
    let set = this.oscListeners.get(sessionId);
    if (!set) {
      set = new Set();
      this.oscListeners.set(sessionId, set);
      // OSC sequences ride the same output stream, so this needs the reader
      // running just as much as `onOutput` does — see `beginOutputStream`.
      this.beginOutputStream(sessionId);
    }
    set.add(cb);
    return () => {
      const s = this.oscListeners.get(sessionId);
      s?.delete(cb);
      if (s && s.size === 0) this.oscListeners.delete(sessionId);
    };
  }

  private cleanup(sessionId: string): void {
    this.outputListeners.delete(sessionId);
    this.exitListeners.delete(sessionId);
    this.oscListeners.delete(sessionId);
    this.setupInProgress.delete(sessionId);
    const unlisteners = this.unlisteners.get(sessionId);
    if (unlisteners) {
      unlisteners.forEach((fn) => fn());
      this.unlisteners.delete(sessionId);
    }
  }
}

/**
 * Parse OSC (Operating System Command) escape sequences from a chunk of raw
 * terminal output and call `emit` once per sequence found.
 *
 * Handles both BEL-terminated (`ESC ] <code> ; <payload> BEL`) and
 * ST-terminated (`ESC ] <code> ; <payload> ESC \`) forms.
 *
 * Exported for unit testing; not part of the public extension surface.
 * @internal
 */
export function parseOscSequences(
  chunk: string,
  emit: (event: OscEvent) => void,
): void {
  // Match ESC ] <digits> ; <payload> (BEL | ESC \)
  const OSC_RE = /\x1b\](\d+);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
  let m: RegExpExecArray | null;
  while ((m = OSC_RE.exec(chunk)) !== null) {
    emit({ code: Number(m[1]), payload: m[2] });
  }
}

export const tauriTerminalClient = new TauriTerminalClient();
