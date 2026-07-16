/**
 * Which workspace (if any) currently owns a terminal record, scanning every
 * workspace rather than assuming the active one. Backs two call sites in
 * {@link TerminalPanel}: the unmount-kill guard (kill the PTY only when the
 * record was actually removed — tab close / workspace delete — never when the
 * panel merely unmounts because the dock is hidden or the last open workspace
 * soft-closed, since records and sessions must survive that) and resolving a
 * terminal-matched file path against its owning workspace's folder.
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
