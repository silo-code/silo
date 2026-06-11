import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSnapshot } from "valtio";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import {
  DND_MIME,
  useServiceState,
  type EditorProps,
  type ExtensionContext,
} from "@silo-code/sdk";
import {
  store,
  findEditor,
  setEditorFilePath,
  setEditorScrollPosition,
  getEditorScrollPosition,
  setEditorBackup,
  clearEditorBackup,
  readEditorBackup,
  resolveRestoredBuffer,
  getEditorSettings,
  monacoThemeName,
  languageFromPath,
  toTextEditorOptions,
  setupMonacoEditor,
  retryFocus,
  useFocusOnActive,
  blurTextareaWithin,
  isTextareaFocusedWithin,
} from "@silo-code/extension-host/internal";
import "./EditorPanel.css";

export function TextViewer({
  editorId,
  dockApi,
  ctx,
}: EditorProps & { ctx: ExtensionContext }) {
  const snap = useSnapshot(store);
  const themeSnap = useServiceState(ctx.theme);
  const files = ctx.files;
  const dnd = ctx.dnd;

  const wsId = store.activeWorkspaceId;
  const record = wsId ? findEditor(wsId, editorId) : null;
  const filePath = record?.filePath ?? null;
  const isUntitled = record !== null && filePath === null;

  // Both saved files and untitled buffers start with `null` content so we
  // render the placeholder for one paint before Monaco mounts. This lets
  // dockview finish its own focus shuffle around a freshly-added panel — if
  // Monaco mounts synchronously with addPanel(), dockview's later focus pass
  // steals keyboard focus back to the previously-active editor.
  const [content, setContent] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const savedContentRef = useRef<string>("");
  const filePathRef = useRef<string | null>(null);
  const wsIdRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  // Path whose contents we've already loaded into the editor. Lets us skip
  // re-reading from disk when an untitled buffer is "save-as"d — we just
  // wrote the file ourselves so disk == in-memory.
  const loadedPathRef = useRef<string | null>(null);

  filePathRef.current = filePath;
  wsIdRef.current = wsId;

  async function save() {
    const ed = editorRef.current;
    const ws = wsIdRef.current;
    if (!ed || !ws) return;
    let path = filePathRef.current;
    // Skip the disk write when the editor is clean and content matches
    // what's on disk. Prevents touching mtime on every Cmd+S, which would
    // otherwise trigger Vite HMR reloads when editing files inside the
    // project tree. Checked before format-on-save so a no-op save never
    // reformats (and dirties) an untouched file.
    if (
      path &&
      !dirtyRef.current &&
      ed.getValue() === savedContentRef.current
    ) {
      return;
    }
    if (getEditorSettings().formatOnSave) {
      // "Format Document" mutates the model in place and no-ops for languages
      // without a registered formatter. Awaited so getValue() below reads the
      // formatted text. Best-effort: a formatter failure must never block save.
      try {
        await ed.getAction("editor.action.formatDocument")?.run();
      } catch {
        // ignore — fall through and save the unformatted content
      }
    }
    const text = ed.getValue();
    // Defensive guard: refuse to overwrite a non-empty file with empty
    // content unless the user explicitly emptied the buffer. If this ever
    // fires, save() was invoked against an editor whose Monaco instance is
    // in a transient empty state — has truncated source files before.
    if (
      path &&
      text.length === 0 &&
      savedContentRef.current.length > 0 &&
      !dirtyRef.current
    ) {
      console.warn(
        `[save] refusing to write empty content over non-empty file (path=${path}, editorId=${editorId}). Editor likely not in sync.`,
      );
      return;
    }
    if (!path) {
      const folder = store.workspaces[ws]?.folder;
      // Seed the dialog with the buffer's title so a typed untitled buffer
      // (e.g. "Untitled.foo") suggests its extension as the filename.
      const defaultPath =
        folder && record?.title ? `${folder}/${record.title}` : folder;
      const picked = await ctx.ui.savePath({ defaultPath });
      if (picked === null) return;
      path = picked;
    }
    try {
      await files.writeText(path, text);
      savedContentRef.current = text;
      loadedPathRef.current = path;
      if (!filePathRef.current) {
        setEditorFilePath(ws, editorId, path);
        dockApi.setTitle(path.split("/").pop() ?? path);
      }
      setDirty(false);
      void clearEditorBackup(editorId);
    } catch (err) {
      setError(String(err));
    }
  }

  // Apply the hot-exit restore decision (shared by the untitled and file load
  // paths so the rule lives in one place): show the backup when it diverges from
  // disk (dirty), else the disk text (clean), dropping a stale backup that matched.
  function applyRestoredBuffer(
    diskText: string | null,
    backupContent: string | null,
  ): void {
    const { content: restored, dirty: isDirty } = resolveRestoredBuffer({
      diskText,
      backup: backupContent,
    });
    setContent(restored);
    setDirty(isDirty);
    if (!isDirty && backupContent !== null) void clearEditorBackup(editorId);
  }

  useEffect(() => {
    if (!isUntitled) return;
    if (loadedPathRef.current !== null) return;
    // Mark loaded synchronously so a re-render can't re-enter this effect while
    // the backup read is in flight. An untitled buffer has no disk content, so
    // its "saved" baseline is the empty string.
    savedContentRef.current = "";
    loadedPathRef.current = "";
    let cancelled = false;
    readEditorBackup(editorId)
      .then((backup) => {
        if (!cancelled) applyRestoredBuffer(null, backup?.content ?? null);
      })
      .catch(() => {
        if (!cancelled) applyRestoredBuffer(null, null);
      });
    return () => {
      cancelled = true;
    };
  }, [isUntitled]);

  useEffect(() => {
    if (!filePath) return;
    if (loadedPathRef.current === filePath) return;
    let cancelled = false;
    // Read the file and any hot-exit backup together. If a backup differs from
    // disk, it's the user's unsaved work — restore it and mark the tab dirty;
    // otherwise show the disk content (and drop a stale backup that matched).
    Promise.all([files.readText(filePath), readEditorBackup(editorId)])
      .then(([text, backup]) => {
        if (cancelled) return;
        savedContentRef.current = text;
        loadedPathRef.current = filePath;
        applyRestoredBuffer(text, backup?.content ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // External-change reload: when the file is rewritten outside the editor,
  // pull the new contents into Monaco. Skip if the editor has unsaved edits —
  // we don't want to silently clobber the user's work. Echoes of our own
  // save are filtered by the disk-vs-savedContentRef equality check. The watch
  // is scoped to this file, so we don't re-check the changed path ourselves.
  useEffect(() => {
    if (!filePath) return;
    let cancelled = false;
    const sub = files.watch(filePath, () => {
      if (cancelled) return;
      files
        .readText(filePath)
        .then((text) => {
          if (cancelled) return;
          if (text === savedContentRef.current) return;
          if (dirtyRef.current) return;
          savedContentRef.current = text;
          loadedPathRef.current = filePath;
          setContent(text);
          setDirty(false);
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      sub.dispose();
    };
  }, [filePath]);

  // Surface dirty state to the tab via dockview panel params; DockTab renders
  // the indicator. Reset on unmount so a recycled panel id never shows stale
  // dirt. (Merges with existing params, so editorId is preserved.)
  useEffect(() => {
    dockApi.updateParameters({ dirty });
    return () => dockApi.updateParameters({ dirty: false });
  }, [dirty, dockApi]);

  async function saveAs() {
    const ed = editorRef.current;
    const ws = wsIdRef.current;
    if (!ed || !ws) return;
    const folder = store.workspaces[ws]?.folder;
    const defaultPath =
      folder && record?.title ? `${folder}/${record.title}` : folder;
    const picked = await ctx.ui.savePath({ defaultPath });
    if (picked === null) return;
    const text = ed.getValue();
    try {
      await files.writeText(picked, text);
      savedContentRef.current = text;
      loadedPathRef.current = picked;
      setEditorFilePath(ws, editorId, picked);
      dockApi.setTitle(picked.split("/").pop() ?? picked);
      setDirty(false);
      void clearEditorBackup(editorId);
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    const sub = ctx.editors.registerSaveHandler(editorId, {
      save,
      saveAs,
    });
    return () => sub.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorId]);

  // Capture final scroll position on unmount so it survives a full reload.
  useEffect(() => {
    return () => {
      const ed = editorRef.current;
      const ws = wsIdRef.current;
      if (ed && ws) {
        setEditorScrollPosition(
          ws,
          editorId,
          ed.getScrollTop(),
          ed.getScrollLeft(),
        );
      }
    };
  }, [editorId]);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    // Shared core setup: app themes + active theme + strip the broken
    // semantic-navigation context-menu actions. Same call the diff mode makes,
    // so both stay in lockstep.
    setupMonacoEditor(monaco, editor);

    // Restore persisted scroll position
    const wsId = wsIdRef.current;
    if (wsId) {
      const pos = getEditorScrollPosition(wsId, editorId);
      if (pos) {
        requestAnimationFrame(() => {
          editor.setScrollTop(pos.top);
          editor.setScrollLeft(pos.left);
        });
      }
    }

    // Persist scroll position on change (debounced)
    let scrollTimer: number | null = null;
    editor.onDidScrollChange(() => {
      if (scrollTimer !== null) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        const ws = wsIdRef.current;
        if (!ws) return;
        setEditorScrollPosition(
          ws,
          editorId,
          editor.getScrollTop(),
          editor.getScrollLeft(),
        );
      }, 300);
    });

    // Intentionally NOT registering Monaco's own Cmd+S keybinding. When
    // Monaco's keybinding service claims Cmd+S and preventDefaults, AppKit's
    // menu accelerator gets suppressed — and Monaco dispatches the command
    // to whichever editor instance owns DOM text focus, which can be a
    // different editor than the active dock panel. Letting the menu
    // accelerator be the sole Cmd+S handler routes through saveActiveEditor
    // and contextKeys.activeEditorId, which is the reliable signal.

    // A freshly-added editor panel does NOT inherit DOM focus from the click
    // that created it — focus remains on whatever the user was typing in
    // before (often a terminal). For "Open file…" this is masked by the save
    // dialog modal, but for "New file" there's no modal so focus stays put.
    //
    // `editor.focus()` only takes effect after Monaco's internal textarea is
    // laid out with non-zero dimensions, so retry across frames until it lands.
    retryFocus(
      () => editor.focus(),
      () => isTextareaFocusedWithin(editor.getDomNode()),
    );
  };

  useFocusOnActive(
    dockApi,
    () => editorRef.current?.focus(),
    () => isTextareaFocusedWithin(editorRef.current?.getDomNode()),
    () => blurTextareaWithin(editorRef.current?.getDomNode()),
  );

  // Shift-held file drops insert the path at the editor caret. Plain
  // (copy-mode) drops fall through to dockview, which opens the file as a new
  // pane. Capture phase keeps the event off of dockview's bubble-phase drop
  // handler so we don't ALSO add a tab.
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const reg = dnd.registerDropTarget(node, {
      accepts: [DND_MIME.filePath],
      capture: true,
      onDrop({ mode, items }) {
        if (mode !== "paste") return; // copy mode → let dockview open a pane
        const path = items.find((i) => i.mime === DND_MIME.filePath)?.value;
        if (!path) return;
        const ed = editorRef.current;
        if (!ed) return;
        const selection = ed.getSelection();
        if (!selection) return;
        ed.executeEdits("paste-path", [
          { range: selection, text: path, forceMoveMarkers: true },
        ]);
        ed.focus();
        return true; // handled — host preventDefault + stopPropagation
      },
    });
    return () => reg.dispose();
  }, []);

  let body: ReactNode;
  if (!record) {
    body = <div className="placeholder">Editor record not found.</div>;
  } else if (error) {
    body = <div className="placeholder error">Failed: {error}</div>;
  } else if (content === null) {
    body = <div className="placeholder">Loading {filePath}…</div>;
  } else {
    // Give Monaco a per-editor URI that preserves the real file's basename
    // (and therefore its extension). The worker decides whether to parse a
    // model as JSX from the URI extension (.tsx/.jsx) — without it, JSX files
    // are parsed as plain TS and every tag becomes a syntax error. We key on
    // the unique editorId rather than the absolute path so two editors on the
    // same file (e.g. across workspaces) never share — and accidentally
    // dispose — one another's model. Untitled buffers fall back to the tab
    // title (no extension → plaintext), still unique per editor.
    const modelName = filePath ? filePath.split("/").pop()! : record.title;
    const modelPath = `file:///${editorId}/${modelName}`;
    body = (
      <Editor
        height="100%"
        path={modelPath}
        theme={monacoThemeName(ctx.theme.resolve(themeSnap.activeId).base)}
        language={languageFromPath(filePath ?? record.title)}
        value={content}
        onChange={(v) => {
          const next = v ?? "";
          setContent(next);
          const nextDirty = next !== savedContentRef.current;
          setDirty(nextDirty);
          // Mirror the buffer into the hot-exit backup so it survives a restart;
          // drop it on the dirty→clean transition only (not on every keystroke
          // that stays clean, which would be an fs_delete per keystroke).
          if (nextDirty) setEditorBackup(editorId, filePathRef.current, next);
          else if (dirtyRef.current) void clearEditorBackup(editorId);
        }}
        onMount={onMount}
        // The shared core's text-mode options: global editor settings (minimap,
        // indentation, wrap, whitespace, formatOnType/Paste, …) + font + drop
        // handling. Diff mode derives from the same settings via the sibling
        // builder, so the two can't drift. Updates flow through because
        // @monaco-editor/react re-applies the options prop.
        options={toTextEditorOptions(snap.editorSettings, snap.uiFontSize)}
      />
    );
  }

  return (
    <div className="editor-panel" ref={rootRef}>
      {body}
    </div>
  );
}
