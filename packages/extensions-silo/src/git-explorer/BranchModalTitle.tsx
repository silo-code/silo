import { useSyncExternalStore } from "react";
import {
  MenuButton,
  useServiceState,
  type ExtensionContext,
} from "@silo-code/sdk";
import { folderLabel, workspaceFolders } from "./branch-model";
import type { FolderSelection } from "./folder-selection";

export interface BranchModalTitleProps {
  ctx: ExtensionContext;
  /** Workspace whose folders populate the switcher (mirrors `folder`). */
  workspaceId: string;
  /** Shared with `BranchManager` — see folder-selection.ts. */
  selection: FolderSelection;
}

/**
 * The Branches modal's `title` (`ctx.ui.showModal`'s `title` accepts any
 * `ReactNode` — not a plain string): "Branches" plus, in a multi-root
 * workspace, a folder switcher. A single-folder workspace just names the
 * folder — the dropdown affordance would have nothing else to offer.
 */
export function BranchModalTitle({
  ctx,
  workspaceId,
  selection,
}: BranchModalTitleProps) {
  const folder = useSyncExternalStore(
    selection.subscribe,
    selection.get,
    selection.get,
  );
  const wsState = useServiceState(ctx.workspaces);
  const ws = wsState.all.find((w) => w.id === workspaceId);
  const folders = ws ? workspaceFolders(ws) : [folder];

  return (
    <span className="git-branch-modal-title">
      Branches
      {folders.length > 1 ? (
        <MenuButton
          label={folderLabel(folder)}
          onClick={(e) =>
            void ctx.ui.showMenu({
              anchor: e.currentTarget,
              align: "end",
              items: folders.map((f) => ({
                label: folderLabel(f),
                title: f,
                checked: f === folder,
                run: () => selection.set(f),
              })),
            })
          }
        />
      ) : (
        <span className="git-branch-modal-title-folder">
          {folderLabel(folder)}
        </span>
      )}
    </span>
  );
}
