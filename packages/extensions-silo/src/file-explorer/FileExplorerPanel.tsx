import { useEffect, useRef } from "react";
import {
  useServiceState,
  type ExtensionContext,
  type ExtensionStorage,
} from "@silo-code/sdk";
import { rootName } from "./tree-types";
import { Tree } from "./Tree";
import "./FileExplorerPanel.css";

const TREE_EXPANDED_KEY = "treeExpanded";
const TREE_SELECTED_KEY = "treeSelected";
const SCROLL_TOP_KEY = "scrollTop";

type ExpandedMap = Record<string, boolean>;
type SelectedMap = Record<string, string | null>;

export function FileExplorerPanel({
  ctx,
  storage,
}: {
  ctx: ExtensionContext;
  storage: ExtensionStorage;
}) {
  const wsState = useServiceState(ctx.workspaces);
  const ws = wsState.all.find((w) => w.id === wsState.activeId) ?? null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore scroll position when the active workspace changes. The ResizeObserver
  // retries if the content isn't tall enough yet (directories still loading).
  useEffect(() => {
    // Cancel any pending save from the previous workspace before restoring.
    if (scrollTimerRef.current !== null) {
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }
    const el = scrollRef.current;
    if (!el) return;
    const saved = storage.get<number>(SCROLL_TOP_KEY, 0) ?? 0;
    if (saved === 0) return;
    el.scrollTop = saved;
    if (el.scrollTop >= saved) return;
    const obs = new ResizeObserver(() => {
      el.scrollTop = saved;
      if (el.scrollTop >= saved) obs.disconnect();
    });
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws?.id]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const top = e.currentTarget.scrollTop;
    if (scrollTimerRef.current !== null) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      storage.set(SCROLL_TOP_KEY, top);
      scrollTimerRef.current = null;
    }, 300);
  }

  // Per-workspace expansion state lives in the panel's storage bag (which the
  // host swaps and persists per active workspace), not on the Workspace model.
  const treeExpanded = storage.get<ExpandedMap>(TREE_EXPANDED_KEY, {});
  const persistExpanded = (next: ExpandedMap) =>
    storage.set(TREE_EXPANDED_KEY, {
      ...storage.get<ExpandedMap>(TREE_EXPANDED_KEY, {}),
      ...next,
    });

  // Per-workspace, per-root selection state.
  const treeSelected = storage.get<SelectedMap>(TREE_SELECTED_KEY, {});
  const persistSelected = (folder: string, path: string | null) =>
    storage.set(TREE_SELECTED_KEY, {
      ...storage.get<SelectedMap>(TREE_SELECTED_KEY, {}),
      [folder]: path,
    });

  if (!ws) return <div className="placeholder">No active workspace.</div>;

  const allFolders = [ws.folder, ...(ws.extraFolders ?? [])];

  // Focus, the single Tab stop, and the keyboard-only ring are owned per-tree by
  // useFocusGroup (mirroring the Workspaces panel) — no panel-level focus
  // tracking. The host's region model lands entry focus on the active tree's
  // selected row and Tab hands off from the last row to the editor.
  return (
    <div className="file-explorer-panel">
      <div
        ref={scrollRef}
        className="file-explorer-scroll"
        onScroll={handleScroll}
      >
        {allFolders.map((folder) => (
          <Tree
            key={ws.id + "::" + folder}
            ctx={ctx}
            workspaceId={ws.id}
            root={folder}
            rootLabel={rootName(folder)}
            initialExpanded={treeExpanded}
            persistExpanded={persistExpanded}
            initialSelected={treeSelected[folder] ?? null}
            persistSelected={(path) => persistSelected(folder, path)}
          />
        ))}
      </div>
    </div>
  );
}
