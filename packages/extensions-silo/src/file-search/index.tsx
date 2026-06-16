import type { Extension } from "@silo-code/sdk";
import { FileSearchPanel } from "./FileSearchPanel";
import { requestSearch } from "./search-bus";

const PANEL_ID = "file-search";
const FIND_COMMAND = "silo.file-search.findInFiles";

// `silo.file-search` — a VS Code-style content-search side panel. Searches file
// contents across the workspace via `ctx.search`, lists matches grouped by file
// with highlighted previews, and opens a clicked match at its exact line. The
// Cmd+Shift+F command reveals the panel seeded with the current selection.
export const extension: Extension = {
  id: "silo.file-search",
  manifest: {
    name: "File Search",
    description: "Search across files in the workspace.",
  },
  activate(ctx) {
    ctx.registerSidePanel({
      id: PANEL_ID,
      location: "right",
      title: "Search",
      // Inject ctx so the panel reaches workspaces/editors/search through the
      // public primitives, not host getters.
      component: ({ active, storage }) => (
        <FileSearchPanel ctx={ctx} storage={storage} paused={!active} />
      ),
      order: 3,
      lazyMount: true,
    });

    ctx.registerCommand({
      id: FIND_COMMAND,
      label: "Find in Files",
      run: () => {
        // Seed from whatever is selected in the focused editor/terminal.
        const selection = ctx.ui.getActiveSelectionText();
        requestSearch({ query: selection ?? undefined });
        ctx.layout.revealSidePanel(PANEL_ID);
      },
    });
    ctx.registerKeybinding({
      id: `${FIND_COMMAND}.key`,
      key: "cmd+shift+f",
      command: FIND_COMMAND,
    });
  },
};
