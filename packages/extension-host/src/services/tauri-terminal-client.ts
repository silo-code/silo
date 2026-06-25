import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type OutputListener = (data: string) => void;
type ExitListener = (exitCode: number) => void;

interface CreateOpts {
  cwd: string;
  cols?: number;
  rows?: number;
  /** Program + args to run; undefined → the daemon's default login shell. */
  command?: string[];
}

interface AttachOpts {
  cols?: number;
  rows?: number;
}

export class TauriTerminalClient {
  private outputListeners = new Map<string, Set<OutputListener>>();
  private exitListeners = new Map<string, Set<ExitListener>>();
  private unlisteners = new Map<string, Array<() => void>>();

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
        const e = new Error("Terminal session no longer exists.") as Error & {
          status?: number;
        };
        e.status = 404;
        throw e;
      }
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

    // Listen for output events from this session
    const unlistenOutput = await listen<string>(
      `terminal_output:${sessionId}`,
      (event) => {
        const listeners = this.outputListeners.get(sessionId);
        listeners?.forEach((cb) => cb(event.payload));
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

  onOutput(sessionId: string, cb: OutputListener): () => void {
    let set = this.outputListeners.get(sessionId);
    if (!set) {
      // First listener for this session. Start the backend reader thread now,
      // so that the first output bytes can't arrive before this callback is
      // in place. On non-Windows the command is a no-op. Fire-and-forget —
      // the Rust side is idempotent (AtomicBool swap) so double calls are safe.
      invoke("terminal_start_stream", { sessionId }).catch(() => {});
      set = new Set();
      this.outputListeners.set(sessionId, set);
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
    }
    set.add(cb);
    return () => {
      const s = this.exitListeners.get(sessionId);
      s?.delete(cb);
      if (s && s.size === 0) this.exitListeners.delete(sessionId);
    };
  }

  private cleanup(sessionId: string): void {
    this.outputListeners.delete(sessionId);
    this.exitListeners.delete(sessionId);
    const unlisteners = this.unlisteners.get(sessionId);
    if (unlisteners) {
      unlisteners.forEach((fn) => fn());
      this.unlisteners.delete(sessionId);
    }
  }
}

export const tauriTerminalClient = new TauriTerminalClient();
