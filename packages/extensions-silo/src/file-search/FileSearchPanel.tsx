import {
  useServiceState,
  type ExtensionContext,
  type ExtensionStorage,
} from "@silo-code/sdk";
import { FileSearchView } from "./FileSearchView";
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
  if (!ws) return <div className="placeholder">No active workspace.</div>;

  return (
    <div className="fsearch-panel">
      <FileSearchView
        // Re-mount the view per workspace so its query/results don't leak across.
        key={ws.id}
        ctx={ctx}
        workspace={ws}
        storage={storage}
        paused={paused}
      />
    </div>
  );
}
