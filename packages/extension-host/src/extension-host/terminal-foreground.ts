import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Foreground-process updates for a terminal session (RFC 0010 N1), forwarded by
// the PTY host as `terminal_foreground:<sessionId>` events. Core-only (exposed
// on the `@silo-code/extension-host/internal` barrel, not the public SDK): the
// built-in terminal consumes it for tab-title logic — reverting a stale,
// program-set title once the shell is back at a prompt, and showing the running
// program's name otherwise. If a third-party extension ever needs this, promote
// it to a `ctx.process` member then.

export interface TerminalForeground {
  /** Foreground process-group id the PTY currently routes input to. */
  pgid: number;
  /** True when the foreground group is the shell itself (i.e. at a prompt). */
  atPrompt: boolean;
  /** The foreground leader's program name (e.g. `vim`, `node`, `-zsh`). */
  leader: string;
  /** Working directory of the foreground leader (RFC 0010 N2); "" if unknown. */
  cwd: string;
}

/**
 * Subscribe to a session's foreground updates. Returns an unlisten function;
 * calling it (or calling before the async listener resolves) tears the
 * subscription down cleanly.
 */
export function onTerminalForeground(
  sessionId: string,
  cb: (fg: TerminalForeground) => void,
): () => void {
  let unlisten: (() => void) | null = null;
  let disposed = false;
  void listen<TerminalForeground>(`terminal_foreground:${sessionId}`, (e) =>
    cb(e.payload),
  ).then((un) => {
    if (disposed) un();
    else unlisten = un;
  });
  return () => {
    disposed = true;
    unlisten?.();
    unlisten = null;
  };
}

/**
 * The host's last known foreground state for a session, or `null` if it has
 * none yet.
 *
 * {@link onTerminalForeground} only fires on *change*, and the daemon's one
 * push at attach time can land before a subscriber exists — so a consumer that
 * needs the value *now* (rather than the next change) seeds from here. Without
 * it, a session that reattaches and then sits idle — an agent waiting for input,
 * a shell at a prompt — never reports its foreground state at all.
 */
export async function terminalForegroundSnapshot(
  sessionId: string,
): Promise<TerminalForeground | null> {
  return (
    (await invoke<TerminalForeground | null>("terminal_foreground_snapshot", {
      sessionId,
    })) ?? null
  );
}
