import {
  useServiceState,
  type ExtensionContext,
  type ExtensionStorage,
} from "@silo-code/sdk";
import { rootName } from "./tree-types";
import { Tree } from "./Tree";
import "./FileExplorerPanel.css";

const TREE_EXPANDED_KEY = "treeExpanded";
type ExpandedMap = Record<string, boolean>;

export function FileExplorerPanel({
  ctx,
  storage,
}: {
  ctx: ExtensionContext;
  storage: ExtensionStorage;
}) {
  const wsState = useServiceState(ctx.workspaces);
  const ws = wsState.all.find((w) => w.id === wsState.activeId) ?? null;

  // Per-workspace expansion state lives in the panel's storage bag (which the
  // host swaps and persists per active workspace), not on the Workspace model.
  const treeExpanded = storage.get<ExpandedMap>(TREE_EXPANDED_KEY, {});
  const persistExpanded = (next: ExpandedMap) =>
    storage.set(TREE_EXPANDED_KEY, {
      ...storage.get<ExpandedMap>(TREE_EXPANDED_KEY, {}),
      ...next,
    });

  if (!ws) return <div className="placeholder">No active workspace.</div>;

  const allFolders = [ws.folder, ...(ws.extraFolders ?? [])];

  // Focus, the single Tab stop, and the keyboard-only ring are owned per-tree by
  // useFocusGroup (mirroring the Workspaces panel) — no panel-level focus
  // tracking. The host's region model lands entry focus on the active tree's
  // selected row and Tab hands off from the last row to the editor.
  return (
    <div className="file-explorer-panel">
      <div className="file-explorer-scroll">
        {allFolders.map((folder) => (
          <Tree
            key={ws.id + "::" + folder}
            ctx={ctx}
            workspaceId={ws.id}
            root={folder}
            rootLabel={rootName(folder)}
            initialExpanded={treeExpanded}
            persistExpanded={persistExpanded}
          />
        ))}
      </div>
    </div>
  );
}
