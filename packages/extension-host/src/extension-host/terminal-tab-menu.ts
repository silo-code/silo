import type { MenuEntry } from "@silo-code/sdk";
import { store } from "../state/store";
import { findTerminal, renameTerminal } from "../state/workspaces";
import { prompt } from "./modal-service";
import { contextMenuEntriesFor } from "./context-menu-items";

// The **one** builder for a terminal's context menu — Rename…, then whatever
// extensions contributed on the `terminal/tab` surface (RFC 0013). Published as
// `ctx.terminals.getTabMenuItems()` so any surface listing a terminal (the dock
// tab, an extension's agent list) offers the same actions, and a contribution
// registered once shows up in all of them.

/** Which workspace owns this terminal — usually the active one, but a surface
 * listing terminals across workspaces can be pointed at any of them. */
function ownerWorkspaceId(
  terminalId: string,
  preferred?: string,
): string | undefined {
  if (preferred && findTerminal(preferred, terminalId)) return preferred;
  const active = store.activeWorkspaceId;
  if (active && findTerminal(active, terminalId)) return active;
  for (const id of Object.keys(store.workspaces)) {
    if (findTerminal(id, terminalId)) return id;
  }
  return undefined;
}

export function buildTerminalTabMenuItems(
  terminalId: string,
  opts: {
    /** Skip the owner search when the caller already knows it. */
    workspaceId?: string;
    /**
     * Called with the committed name after a rename. The dock tab uses it to
     * push the new label into its dockview panel api, which the store rename
     * alone doesn't touch.
     */
    onRenamed?: (name: string) => void;
  } = {},
): MenuEntry[] {
  const wsId = ownerWorkspaceId(terminalId, opts.workspaceId);
  if (!wsId) return [];

  const record = findTerminal(wsId, terminalId);
  const items: MenuEntry[] = [
    {
      label: "Rename…",
      run: () => {
        void (async () => {
          const next = await prompt({
            title: "Rename Terminal",
            label: "Terminal name",
            initialValue: record?.customName ?? record?.title ?? "",
            placeholder: "Leave empty to use the automatic name",
            resetLabel: record?.customName ? "Reset" : undefined,
          });
          if (next === null) return;
          renameTerminal(wsId, terminalId, next);
          if (next.trim()) opts.onRenamed?.(next.trim());
        })();
      },
    },
  ];

  const contributed = contextMenuEntriesFor("terminal/tab", {
    terminalId,
    workspaceId: wsId,
  });
  if (contributed.length > 0) {
    items.push({ type: "separator" }, ...contributed);
  }
  return items;
}
