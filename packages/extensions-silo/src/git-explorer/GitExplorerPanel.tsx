import { useServiceState, type ExtensionContext } from "@silo-code/sdk";
import { GitView } from "./GitView";
import "./GitExplorerPanel.css";

function rootName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

export function GitExplorerPanel({
  ctx,
  paused = false,
}: {
  ctx: ExtensionContext;
  paused?: boolean;
}) {
  const wsState = useServiceState(ctx.workspaces);
  const ws = wsState.all.find((w) => w.id === wsState.activeId) ?? null;
  if (!ws) return <div className="placeholder">No active workspace.</div>;

  const allFolders = [ws.folder, ...(ws.extraFolders ?? [])];
  const showLabel = allFolders.length > 1;

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
        />
      ))}
    </div>
  );
}
