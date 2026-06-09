import { lazy, Suspense } from "react";
import type { DockPanelApi, ExtensionContext } from "@silo-code/sdk";

const Inner = lazy(async () => {
  const [{ DiffViewer }] = await Promise.all([
    import("./DiffPanel"),
    import("@silo-code/extension-host/internal").then((m) => m.ensureMonaco()),
  ]);
  return { default: DiffViewer };
});

/** Lazy boundary for the diff mode — keeps Monaco off the startup bundle, the
 * mirror of the text editor's lazy `TextEditor`. Mounted by {@link EditorPanel}
 * when the active record's `mode` is `"diff"`. */
export function DiffPanelLazy(props: {
  editorId: string;
  ctx: ExtensionContext;
  dockApi: DockPanelApi;
}) {
  return (
    <Suspense
      fallback={<div className="editor-panel placeholder">Loading diff…</div>}
    >
      <Inner {...props} />
    </Suspense>
  );
}
