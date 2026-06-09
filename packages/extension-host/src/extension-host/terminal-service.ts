import { store } from "../state/store";
import { addTerminal, removeTerminal } from "../state/workspaces";
import { tauriTerminalClient } from "../services/tauri-terminal-client";
import type { TerminalService } from "@silo-code/sdk";

// `ctx.terminals` — the public contract lives in @silo-code/sdk
// (terminal-service.ts); this is the host implementation.

let service: TerminalService | null = null;

/** @internal — host factory; extensions receive this as `ctx.terminals`. */
export function getTerminalService(): TerminalService {
  if (service) return service;
  service = {
    create(input) {
      const workspaceId = input?.workspaceId ?? store.activeWorkspaceId;
      if (!workspaceId) return undefined;
      return addTerminal(workspaceId, input?.kind ?? "shell", input?.cwd);
    },
    closeWorkspace(workspaceId) {
      const ws = store.workspaces[workspaceId];
      if (!ws) return;
      // Snapshot ids first — removeTerminal mutates the array.
      const ids = ws.terminals.map((t) => t.id);
      for (const id of ids) {
        const rec = removeTerminal(workspaceId, id);
        if (rec?.sessionId) {
          tauriTerminalClient
            .deleteTerminal(rec.sessionId)
            .catch((err) => console.warn("delete terminal failed", err));
        }
      }
    },
  };
  return service;
}
