import { useSnapshot } from "valtio";
import { store } from "@silo-code/extension-host/internal";
import type { ExtensionContext } from "@silo-code/sdk";
import { Breadcrumb } from "./Breadcrumb";
import { ViewSwitcher } from "./ViewSwitcher";
import { ContributedToolbar } from "../shared/ContributedToolbar";
import "./EditorBreadcrumb.css";

interface Props {
  editorId: string;
  ctx: ExtensionContext;
}

export function EditorBreadcrumb({ editorId, ctx }: Props) {
  const snap = useSnapshot(store);
  const wsId = snap.activeWorkspaceId;
  const ws = wsId ? snap.workspaces[wsId] : null;
  const record = ws?.editors.find((e) => e.id === editorId);
  if (!record) return null;

  const showCrumbs = snap.editorSettings.breadcrumbs;

  return (
    <div className="editor-breadcrumb">
      {showCrumbs && (
        <Breadcrumb filePath={record.filePath} workspaceFolder={ws?.folder} />
      )}
      {showCrumbs && (
        <ContributedToolbar
          surface="editor"
          target={{ editorId: record.id }}
          showMenu={ctx.ui.showMenu}
        />
      )}
      <ViewSwitcher
        ctx={ctx}
        workspaceId={wsId ?? undefined}
        editorId={record.id}
        filePath={record.filePath}
        viewType={record.viewType ?? null}
        isDiff={record.mode === "diff"}
      />
    </div>
  );
}
