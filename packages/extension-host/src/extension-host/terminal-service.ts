import { store } from "../state/store";
import {
  activateWorkspace,
  addTerminal,
  removeTerminal,
} from "../state/workspaces";
import { tauriTerminalClient } from "../services/tauri-terminal-client";
import type {
  TerminalService,
  TerminalTabDecorationProvider,
} from "@silo-code/sdk";
import { terminalTabDecorationRegistry } from "./terminal-tab-decoration-registry";
import { focusCenterDock, getActiveDockApi } from "../docked/dock-api-registry";

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
    focus(terminalId) {
      // Find which workspace owns this terminal.
      const wsId = Object.values(store.workspaces).find((ws) =>
        ws.terminals.some((t) => t.id === terminalId),
      )?.id;
      if (!wsId) return;

      const activate = () => {
        getActiveDockApi()?.getPanel(`terminal:${terminalId}`)?.api.setActive();
        focusCenterDock();
      };

      if (store.activeWorkspaceId !== wsId) {
        activateWorkspace(wsId);
        // Defer until the new workspace's dock has mounted.
        setTimeout(activate, 80);
      } else {
        activate();
      }
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
    registerTabDecoration(provider: TerminalTabDecorationProvider) {
      return terminalTabDecorationRegistry.register(provider);
    },
    getTabDecoration: terminalTabDecorationRegistry.getTabDecoration.bind(
      terminalTabDecorationRegistry,
    ),
    invalidateTabDecorations: terminalTabDecorationRegistry.invalidate.bind(
      terminalTabDecorationRegistry,
    ),
    subscribeTabDecorations: terminalTabDecorationRegistry.subscribe.bind(
      terminalTabDecorationRegistry,
    ),
  };
  return service;
}
