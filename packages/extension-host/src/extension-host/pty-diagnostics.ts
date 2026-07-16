import type { TerminalRecord } from "../state/types";

// Pure logic behind the `silo:terminals` Output channel (terminal-service.ts):
// flattening/rolling up live PTYs for the periodic dump, and formatting the
// create/delete event lines. Extracted so it's unit-testable without a real
// valtio store — terminal-service.ts supplies the live `store.workspaces` and
// wires these into `createHostChannel("silo:terminals", ...)`.

/** The minimal workspace shape this module needs — decoupled from the full
 * `WorkspaceInternal` type so the pure functions below are trivial to test. */
export interface PtyWorkspaceInput {
  id: string;
  name: string;
  closedAt?: string | null;
  terminals: TerminalRecord[];
}

/** One live (spawned) PTY, flattened out of a workspace's terminal records. */
export interface PtyEntry {
  workspaceId: string;
  workspaceName: string;
  workspaceClosed: boolean;
  terminalId: string;
  /** Display name — the user's rename if set, else the PTY-derived title. */
  terminalName: string;
  sessionId: string;
  cwd?: string;
}

/** A workspace's live PTYs, rolled up for the periodic dump — no ids, just
 * enough to eyeball at a glance whether something's lingering that shouldn't be. */
export interface PtyWorkspaceSummary {
  workspaceName: string;
  workspaceClosed: boolean;
  count: number;
  terminals: string[];
}

/** Every live PTY across all workspaces — a terminal record only counts once
 * it has actually spawned a session (empty `sessionId` = not spawned yet). */
export function collectLivePtys(
  workspaces: Record<string, PtyWorkspaceInput | undefined>,
): PtyEntry[] {
  const entries: PtyEntry[] = [];
  for (const ws of Object.values(workspaces)) {
    if (!ws) continue;
    for (const t of ws.terminals) {
      if (!t.sessionId) continue;
      entries.push({
        workspaceId: ws.id,
        workspaceName: ws.name,
        workspaceClosed: Boolean(ws.closedAt),
        terminalId: t.id,
        terminalName: t.customName || t.title,
        sessionId: t.sessionId,
        cwd: t.cwd,
      });
    }
  }
  return entries;
}

/** Roll a flat PTY list up into one entry per workspace: a count plus its
 * terminals' display names — no workspace/terminal/session ids. */
export function summarizePtysByWorkspace(
  entries: readonly PtyEntry[],
): PtyWorkspaceSummary[] {
  const byWorkspace = new Map<string, PtyWorkspaceSummary>();
  for (const e of entries) {
    let summary = byWorkspace.get(e.workspaceId);
    if (!summary) {
      summary = {
        workspaceName: e.workspaceName,
        workspaceClosed: e.workspaceClosed,
        count: 0,
        terminals: [],
      };
      byWorkspace.set(e.workspaceId, summary);
    }
    summary.count++;
    summary.terminals.push(e.terminalName);
  }
  return Array.from(byWorkspace.values());
}

/** Format a single "PTY created"/"PTY deleted" event line. */
export function formatPtyEventMessage(
  action: "created" | "deleted",
  info: {
    workspaceName: string;
    terminalId: string;
    sessionId: string;
    reason?: string;
  },
): string {
  const suffix = info.reason ? ` (${info.reason})` : "";
  return `PTY ${action}: session=${info.sessionId} workspace="${info.workspaceName}" terminal=${info.terminalId}${suffix}`;
}

/** Format the periodic dump's message — always the compact per-workspace
 * rollup (see {@link summarizePtysByWorkspace}), never the raw per-PTY list. */
export function formatPtySummaryMessage(entries: readonly PtyEntry[]): {
  message: string;
  data: { workspaces: PtyWorkspaceSummary[] };
} {
  const workspaces = summarizePtysByWorkspace(entries);
  return {
    message: `PTY summary: ${entries.length} live session(s) across ${workspaces.length} workspace(s)`,
    data: { workspaces },
  };
}
