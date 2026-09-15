import type { MenuEntry } from "@silo-code/sdk";
import {
  findPanelRecord,
  renamePanelRecord,
  workspaceIdForPanelRecord,
} from "../state/workspaces";
import { prompt } from "./modal-service";
import { contextMenuEntriesFor } from "./context-menu-items";
import { dockPanelKindRegistry } from "./dock-panel-kinds";

// The **one** builder for a dock panel tab's context menu — Rename… on a
// renamable kind, then whatever extensions contributed on the `panel/tab`
// surface (RFC 0046). The terminal twin is `terminal-tab-menu.ts`; the shape is
// deliberately the same, because the only thing that differs between a terminal
// tab and a panel tab is where the name is stored.
//
// Nothing here knows a kind id. A panel is renamable because its kind says so
// (or is recorded, which implies it), and contributions scope themselves by
// `kindId` — so disabling the bundled Chat panel for a third-party one changes
// nothing about what its tab can do.

/** A panel id is `kind:id`, the same shape editors and terminals use. Unlike
 *  `parseRecordedPanelId` this accepts a **transient** kind too: such a panel
 *  has no record to name, but its tab still takes contributed items. */
function splitPanelId(
  panelId: string,
): { kindId: string; recordId: string } | null {
  const i = panelId.indexOf(":");
  if (i <= 0) return null;
  const recordId = panelId.slice(i + 1);
  if (!recordId) return null;
  return { kindId: panelId.slice(0, i), recordId };
}

export function buildPanelTabMenuItems(
  panelId: string,
  opts: {
    /** Skip the owner lookup when the caller already knows it. */
    workspaceId?: string;
    /** The panel's live dockview params; copied before extensions see them. */
    params?: Readonly<Record<string, unknown>>;
    /**
     * Called with the committed name after a rename. The dock tab uses it to
     * push the new label into its dockview panel api, so the tab updates now
     * rather than on the next store notification.
     */
    onRenamed?: (name: string) => void;
  } = {},
): MenuEntry[] {
  const parsed = splitPanelId(panelId);
  if (!parsed) return [];
  const kind = dockPanelKindRegistry.get(parsed.kindId);
  if (!kind) return [];

  const recorded = kind.persistence === "recorded";
  const wsId =
    opts.workspaceId ??
    (recorded ? (workspaceIdForPanelRecord(parsed.recordId) ?? "") : "");
  const record =
    recorded && wsId ? findPanelRecord(wsId, parsed.recordId) : null;

  const items: MenuEntry[] = [];

  if (kind.renamable ?? recorded) {
    items.push({
      label: "Rename…",
      run: () => {
        void (async () => {
          const next = await prompt({
            title: "Rename Tab",
            label: "Tab name",
            initialValue: record?.customTitle ?? "",
            placeholder: "Leave empty to use the automatic name",
            resetLabel: record?.customTitle ? "Reset" : undefined,
          });
          if (next === null) return;
          if (record && wsId) renamePanelRecord(wsId, parsed.recordId, next);
          // An empty name means "go back to whatever the panel calls itself",
          // which only the panel can supply — so there is no label to push.
          if (next.trim()) opts.onRenamed?.(next.trim());
        })();
      },
    });
  }

  const contributed = contextMenuEntriesFor("panel/tab", {
    panelId,
    kindId: parsed.kindId,
    workspaceId: wsId,
    params: { ...(opts.params ?? {}) },
  });
  if (contributed.length > 0) {
    if (items.length > 0) items.push({ type: "separator" });
    items.push(...contributed);
  }
  return items;
}
