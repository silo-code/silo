import { useRef } from "react";
import {
  useServiceState,
  type ExtensionContext,
  type ExtensionStorage,
} from "@silo-code/sdk";
import { FileSearchView } from "./FileSearchView";
import type { WorkspaceViewCache } from "./search-model";
import "./FileSearchPanel.css";

export function FileSearchPanel({
  ctx,
  storage,
  paused = false,
}: {
  ctx: ExtensionContext;
  storage: ExtensionStorage;
  paused?: boolean;
}) {
  const wsState = useServiceState(ctx.workspaces);
  const ws = wsState.all.find((w) => w.id === wsState.activeId) ?? null;

  // Per-workspace cache for results, collapse state, and scroll position so
  // switching workspaces restores the view instead of re-running the search.
  const viewCacheRef = useRef<Map<string, WorkspaceViewCache>>(new Map());

  if (!ws) return <div className="placeholder">No active workspace.</div>;

  return (
    <div className="fsearch-panel">
      <FileSearchView
        key={ws.id}
        ctx={ctx}
        workspace={ws}
        storage={storage}
        paused={paused}
        savedState={viewCacheRef.current.get(ws.id) ?? null}
        onSaveState={(state) => viewCacheRef.current.set(ws.id, state)}
      />
    </div>
  );
}
