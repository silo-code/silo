import { Suspense, useState } from "react";
import type { DockPanelProps } from "@silo-code/sdk";
import { useSnapshot } from "valtio";
import {
  store,
  resolveEditorForRecord,
} from "@silo-code/extension-host/internal";
import { ErrorBoundary } from "@silo-code/extension-host";
import { EditorBreadcrumb } from "./EditorBreadcrumb";
import { DiffPanelLazy } from "./DiffPanelLazy";
import type { DockPanelApi, ExtensionContext } from "@silo-code/sdk";
import "./EditorPanel.css";

export interface EditorPanelParams {
  editorId: string;
}

export function EditorPanel(
  props: DockPanelProps<EditorPanelParams> & { ctx: ExtensionContext },
) {
  const { editorId } = props.params;
  const { ctx } = props;
  const snap = useSnapshot(store);
  const wsId = snap.activeWorkspaceId;
  const wsSnap = wsId ? snap.workspaces[wsId] : null;
  const record = wsSnap?.editors.find((e) => e.id === editorId) ?? null;
  const currentPath = record?.filePath ?? null;
  const currentTitle = record?.title ?? null;
  const currentViewType = record?.viewType ?? null;
  const isPreview = record?.isPreview ?? false;
  const isDiff = record?.mode === "diff";

  // For preview tabs the key changes when the underlying content identity
  // changes → the viewer remounts onto the new file/diff. For a diff that's a
  // preview, the identity is provider + path + args (the diff "of" key); for a
  // text preview it's the path. Permanent tabs use a stable key (no spurious
  // remounts). The chosen view (`viewType`) is part of the identity either way,
  // so switching views in place remounts onto the new presenter.
  const diffKey = isDiff
    ? `diff:${record?.providerId}:${currentPath}:${JSON.stringify(record?.args)}`
    : null;
  const baseKey = isPreview ? (diffKey ?? currentPath ?? editorId) : editorId;
  const viewerKey = `${baseKey}:${currentViewType ?? ""}`;

  return (
    <div className="editor-panel-frame">
      <EditorBreadcrumb editorId={editorId} ctx={ctx} />
      <div className="editor-panel-frame__body">
        <Suspense
          key={viewerKey}
          fallback={<div className="editor-panel placeholder">Loading…</div>}
        >
          <ErrorBoundary name={`editor:${editorId}`}>
            {isDiff ? (
              <DiffPanelLazy
                editorId={editorId}
                ctx={ctx}
                dockApi={props.api}
              />
            ) : (
              <ViewerContent
                filePath={currentPath}
                title={currentTitle}
                viewType={currentViewType}
                editorId={editorId}
                dockApi={props.api}
              />
            )}
          </ErrorBoundary>
        </Suspense>
      </div>
    </div>
  );
}

/** Isolated component so that useState for the viewer is scoped per key. */
function ViewerContent({
  filePath,
  title,
  viewType,
  editorId,
  dockApi,
}: {
  filePath: string | null;
  title: string | null;
  viewType: string | null;
  editorId: string;
  dockApi: DockPanelApi;
}) {
  // Pick the viewer once per mount. A save-as that changes the file extension
  // on a permanent tab shouldn't unmount into a different viewer (that would
  // lose in-memory state). For preview tabs and in-place view switches the key
  // above (which includes viewType) handles remounting.
  const [editor] = useState(() =>
    resolveEditorForRecord(
      filePath !== null || title !== null
        ? { filePath, title: title ?? "", viewType: viewType ?? undefined }
        : null,
    ),
  );
  const EditorComponent = editor.component;

  return (
    <EditorComponent
      editorId={editorId}
      filePath={filePath}
      dockApi={dockApi}
    />
  );
}
