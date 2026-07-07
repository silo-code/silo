import { useCallback, useSyncExternalStore } from "react";
import {
  useServiceState,
  type ExtensionContext,
  type ExtensionStorage,
} from "@silo-code/sdk";
import { GitView } from "./GitView";
import "./GitExplorerPanel.css";

function rootName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

const COLLAPSED_KEY = "collapsed";

type CollapsedMap = Record<string, boolean>;

// Stable reference so useSyncExternalStore's snapshot doesn't change identity
// (and re-render in a loop) while no repo has ever been collapsed.
const EMPTY_COLLAPSED: CollapsedMap = {};

export function GitExplorerPanel({
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

  // Per-workspace, per-repo collapse state lives in the panel's storage bag
  // (which the host swaps and persists per active workspace), not on GitView's
  // own component state — otherwise it resets whenever the view remounts.
  // Subscribed via useSyncExternalStore so toggling a repo re-renders this
  // panel immediately instead of waiting for some unrelated state change.
  const collapsedMap = useSyncExternalStore(
    useCallback((cb) => storage.subscribe(cb).dispose, [storage]),
    useCallback(
      () => storage.get<CollapsedMap>(COLLAPSED_KEY, EMPTY_COLLAPSED),
      [storage],
    ),
  );

  if (!ws) return <div className="placeholder">No active workspace.</div>;

  const allFolders = [ws.folder, ...(ws.extraFolders ?? [])];
  const showLabel = allFolders.length > 1;

  const persistCollapsed = (folder: string, value: boolean) =>
    storage.set(COLLAPSED_KEY, {
      ...storage.get<CollapsedMap>(COLLAPSED_KEY, EMPTY_COLLAPSED),
      [folder]: value,
    });

  return (
    <div className="git-explorer-scroll">
      {allFolders.map((folder) => (
        <GitView
          key={ws.id + "::" + folder}
          ctx={ctx}
          cacheKey={ws.id + "::" + folder}
          workspaceId={ws.id}
          folder={folder}
          rootLabel={showLabel ? rootName(folder) : undefined}
          paused={paused}
          collapsed={showLabel && (collapsedMap[folder] ?? false)}
          onToggleCollapsed={
            showLabel
              ? () => persistCollapsed(folder, !(collapsedMap[folder] ?? false))
              : undefined
          }
        />
      ))}
    </div>
  );
}
