/**
 * Which workspace (if any) currently owns a terminal record, scanning every
 * workspace rather than assuming the active one. Backs two call sites in
 * {@link TerminalPanel}: the unmount-kill guard (kill the PTY only when the
 * record was actually removed — tab close / workspace delete — never when the
 * panel merely unmounts because the dock is hidden or the last open workspace
 * soft-closed, since records and sessions must survive that) and resolving a
 * terminal-matched file path against its owning terminal's cwd.
 */
export function findTerminalOwnerId(
  workspaces: Iterable<
    { id: string; terminals: readonly { id: string }[] } | null | undefined
  >,
  terminalId: string,
): string | null {
  for (const ws of workspaces) {
    if (ws?.terminals.some((t) => t.id === terminalId)) return ws.id;
  }
  return null;
}

/** Cap on automatic reattach attempts after a data-client EOF (false exit). */
export const MAX_EXIT_RECONNECTS = 3;

/**
 * What {@link TerminalPanel} should do when the PTY data stream ends.
 *
 * A stream EOF is not always a dead shell: the session-host can drop the UI's
 * data client (write timeout, MAX_DATA_CLIENTS eviction, …) while the shell
 * keeps running. Prefer a bounded reattach over the permanent "Session ended"
 * overlay; only give up after {@link MAX_EXIT_RECONNECTS} failures in a row.
 */
export type ExitStreamPlan =
  | { action: "reconnect"; attempt: number }
  | { action: "exited"; exitCode: number };

export function planExitStreamEnd(opts: {
  exitCode: number;
  reconnectCount: number;
  maxReconnects?: number;
}): ExitStreamPlan {
  const max = opts.maxReconnects ?? MAX_EXIT_RECONNECTS;
  if (opts.reconnectCount < max) {
    return { action: "reconnect", attempt: opts.reconnectCount + 1 };
  }
  return { action: "exited", exitCode: opts.exitCode };
}

/**
 * After a reconnect-driven remount, a SESSION_GONE attach means the host
 * really died — show the exited overlay with the original exit code. A
 * SESSION_GONE on cold restore (no pending exit) keeps today's recreate path.
 */
export type SessionGonePlan = "exited" | "recreate";

export function planSessionGoneAfterAttach(opts: {
  pendingExitCode: number | null;
}): SessionGonePlan {
  return opts.pendingExitCode !== null ? "exited" : "recreate";
}
