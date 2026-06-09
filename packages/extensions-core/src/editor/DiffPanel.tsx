import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSnapshot } from "valtio";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import {
  useServiceState,
  type DockPanelApi,
  type ExtensionContext,
} from "@silo-code/sdk";
import {
  store,
  findEditor,
  monacoThemeName,
  languageFromPath,
  toDiffEditorOptions,
  setupMonacoEditor,
  getDiffContentProvider,
  retryFocus,
  useFocusOnActive,
  blurTextareaWithin,
  isTextareaFocusedWithin,
} from "@silo-code/extension-host/internal";
import "./EditorPanel.css";

/** Coalesce burst writes (e.g. an agent rewriting a file) into one reload. */
const DIFF_RELOAD_DEBOUNCE_MS = 150;

/**
 * Diff **mode** of the editor surface (see ctx-domains.md → "The editor
 * surface"). Renders the read-only, two-model Monaco diff for an editor record
 * whose `mode` is `"diff"`. It is mounted by {@link EditorPanel} — which owns the
 * frame + breadcrumb — so this component renders only the diff editor body, and
 * shares the editor record lifecycle (preview/promotion, scroll) with text mode.
 */
export function DiffViewer({
  editorId,
  ctx,
  dockApi,
}: {
  editorId: string;
  ctx: ExtensionContext;
  dockApi: DockPanelApi;
}) {
  const snap = useSnapshot(store);
  const themeSnap = useServiceState(ctx.theme);
  const [original, setOriginal] = useState<string | null>(null);
  const [modified, setModified] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(null);
  // Monotonic token so a superseded fetch (an earlier identity, or a watch
  // refetch that lost the race) can't overwrite the current sides on resolve.
  const fetchSeq = useRef(0);

  const wsId = store.activeWorkspaceId;
  const rec = wsId ? findEditor(wsId, editorId) : null;
  const ws = wsId ? store.workspaces[wsId] : null;

  // Resolve the two sides from the record's provider. The content is the
  // provider's concern — the editor just renders what it returns.
  const refetch = useCallback(() => {
    if (!rec || !ws || rec.mode !== "diff" || !rec.providerId) return;
    const provider = getDiffContentProvider(rec.providerId);
    if (!provider) {
      setError(`No diff content provider registered: ${rec.providerId}`);
      return;
    }
    const seq = ++fetchSeq.current;
    provider({
      filePath: rec.filePath!,
      args: rec.args,
      workspaceFolder: ws.folder,
    })
      .then(({ original: orig, modified: mod }) => {
        if (seq !== fetchSeq.current) return;
        setOriginal(orig);
        setModified(mod);
        setError(null);
      })
      .catch((err) => {
        if (seq !== fetchSeq.current) return;
        setError(String(err));
      });
  }, [rec?.filePath, rec?.providerId, JSON.stringify(rec?.args), ws?.folder]);

  // Initial load + reload when the diff's identity changes (open / tab switch /
  // app restart, or a save-as that repoints the record).
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Live-update: when the diffed file is rewritten on disk (an editor save, an
  // agent, an external tool), re-resolve the sides so an open diff doesn't go
  // stale. Mirrors TextViewer's external-change reload; the watch is scoped to
  // this file and host-ref-counted, so it shares the workspace watcher the
  // explorer/git panel already run. Debounced to coalesce burst writes.
  useEffect(() => {
    const filePath = rec?.filePath;
    if (!filePath) return;
    let timer = 0;
    const sub = ctx.files.watch(filePath, () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(refetch, DIFF_RELOAD_DEBOUNCE_MS);
    });
    return () => {
      if (timer) window.clearTimeout(timer);
      sub.dispose();
    };
  }, [rec?.filePath, refetch, ctx.files]);

  const onMount: DiffOnMount = (diffEditor, monaco) => {
    editorRef.current = diffEditor;
    // Shared core setup over both inner editors of the diff (each has its own
    // context menu). Same call the text mode makes — themes + active theme +
    // strip the broken semantic-navigation actions.
    setupMonacoEditor(monaco, [
      diffEditor.getOriginalEditor(),
      diffEditor.getModifiedEditor(),
    ]);

    retryFocus(
      () => diffEditor.focus(),
      () => isTextareaFocusedWithin(diffEditor.getContainerDomNode()),
    );
  };

  useFocusOnActive(
    dockApi,
    () => editorRef.current?.focus(),
    () => isTextareaFocusedWithin(editorRef.current?.getContainerDomNode()),
    () => blurTextareaWithin(editorRef.current?.getContainerDomNode()),
  );

  if (!rec || rec.mode !== "diff" || rec.filePath === null) {
    return <div className="placeholder">Diff record not found.</div>;
  }

  let body: ReactNode;
  if (error) {
    body = (
      <div className="editor-panel placeholder error">Failed: {error}</div>
    );
  } else if (original === null || modified === null) {
    body = <div className="editor-panel placeholder">Loading diff…</div>;
  } else {
    // Per-side, extension-accurate model URIs so the TS worker parses .tsx as
    // JSX (otherwise re-enabled syntax validation flags every tag). Keyed on the
    // unique editor record id so diff models never collide with text-editor
    // models or each other.
    const modelName = rec.filePath.split("/").pop()!;
    const originalModelPath = `file:///${editorId}/original/${modelName}`;
    const modifiedModelPath = `file:///${editorId}/modified/${modelName}`;

    body = (
      <DiffEditor
        height="100%"
        theme={monacoThemeName(ctx.theme.resolve(themeSnap.activeId).base)}
        language={languageFromPath(rec.filePath)}
        original={original}
        modified={modified}
        originalModelPath={originalModelPath}
        modifiedModelPath={modifiedModelPath}
        onMount={onMount}
        // Diff mode derives its display/formatting options — including font
        // size — from the SAME editor settings the text mode uses (it previously
        // hardcoded these, ignored settings, and rendered 0.5px smaller; the
        // consolidation fixes that). Adds only read-only + side-by-side.
        options={toDiffEditorOptions(snap.editorSettings, snap.uiFontSize)}
      />
    );
  }

  return <div className="editor-panel">{body}</div>;
}
