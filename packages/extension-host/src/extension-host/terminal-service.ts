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
  OscEvent,
} from "@silo-code/sdk";
import { terminalTabDecorationRegistry } from "./terminal-tab-decoration-registry";
import {
  getActiveTerminal,
  subscribeActiveTerminal,
} from "./active-terminal-registry";
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
    getActive: getActiveTerminal,
    subscribeActive: subscribeActiveTerminal,
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
    subscribeOsc(terminalId: string, handler: (event: OscEvent) => void) {
      // Resolve the terminal record → its live sessionId. The sessionId may
      // change if the terminal is recreated, so we re-resolve on each event
      // rather than capturing it at subscribe time.
      const getSessionId = () => {
        for (const ws of Object.values(store.workspaces)) {
          const rec = ws?.terminals.find((t) => t.id === terminalId);
          if (rec?.sessionId) return rec.sessionId;
        }
        return null;
      };

      // We need to know the sessionId upfront to start the client listener. If
      // the terminal hasn't spawned yet (sessionId is ""), wait briefly then
      // retry. Most callers subscribe after the terminal is open, so this is
      // typically a no-op.
      let unsub: (() => void) | null = null;

      const attach = () => {
        const sid = getSessionId();
        if (!sid) return;
        unsub = tauriTerminalClient.onOsc(sid, handler);
      };

      attach();

      // If the terminal wasn't ready yet, poll until it has a sessionId.
      // Stop after 10 s to avoid leaking if the terminal never spawns.
      let attempts = 0;
      const poll = unsub
        ? null
        : window.setInterval(() => {
            attach();
            if (unsub || ++attempts > 100) window.clearInterval(poll!);
          }, 100);

      return {
        dispose() {
          if (poll !== null) window.clearInterval(poll);
          unsub?.();
        },
      };
    },
  };
  return service;
}
