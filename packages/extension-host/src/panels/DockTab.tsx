import { useCallback, useEffect, useState } from "react";
import { useSnapshot } from "valtio";
import type { IDockviewPanelHeaderProps } from "dockview";
import { store } from "../state/store";
import {
  findTerminal,
  promotePreviewEditor,
  renameTerminal,
} from "../state/workspaces";
import { prompt } from "../extension-host/modal-service";

// Custom tab: mirrors dockview's default tab DOM, but renders the dirty marker
// as its own styled span so we can size/color it independently. (DockviewDefaultTab
// hardcodes className and ignores children, so wrapping it doesn't work — we
// re-implement the tab markup directly.)
//
// Dirty state is owned by the viewer and surfaced through dockview panel params
// (`api.updateParameters({ dirty })`); the tab is purely a renderer of that flag.
export function DockTab(props: IDockviewPanelHeaderProps) {
  const { api } = props;
  const panelId = api.id;
  const editorId = panelId.startsWith("editor:") ? panelId.slice(7) : null;
  const terminalId = panelId.startsWith("terminal:") ? panelId.slice(9) : null;
  const [title, setTitle] = useState(api.title ?? "");
  const [isDirty, setIsDirty] = useState(
    () => !!api.getParameters<{ dirty?: boolean }>().dirty,
  );
  // True when the viewer's backing file no longer exists on disk (deleted
  // externally). Same params channel as `dirty` — see TextViewer.
  const [isDeleted, setIsDeleted] = useState(
    () => !!api.getParameters<{ deleted?: boolean }>().deleted,
  );
  const snap = useSnapshot(store);

  useEffect(() => {
    const sub = api.onDidTitleChange((e) => setTitle(e.title ?? ""));
    setTitle(api.title ?? "");
    return () => sub.dispose();
  }, [api]);

  // Re-read getParameters() on each change rather than trusting the event
  // payload, which only carries the keys that changed in that update.
  useEffect(() => {
    const read = () => {
      const params = api.getParameters<{
        dirty?: boolean;
        deleted?: boolean;
      }>();
      setIsDirty(!!params.dirty);
      setIsDeleted(!!params.deleted);
    };
    read();
    const sub = api.onDidParametersChange(read);
    return () => sub.dispose();
  }, [api]);

  // Derive preview state reactively from valtio.
  const wsId = snap.activeWorkspaceId;
  const ws = wsId ? snap.workspaces[wsId] : null;
  const isPreview = !!(editorId && ws?.previewEditorId === editorId);

  const onClose = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (editorId && isDirty) {
        window.dispatchEvent(
          new CustomEvent("app:confirm-close-editor", {
            detail: { panelId, title },
          }),
        );
      } else {
        api.close();
      }
    },
    [api, editorId, panelId, title, isDirty],
  );

  // Double-click on a preview tab promotes it to permanent.
  const onTabDoubleClick = useCallback(() => {
    if (editorId && isPreview) {
      promotePreviewEditor(store.activeWorkspaceId!, editorId);
    }
  }, [editorId, isPreview]);

  // Middle-click on tab content closes the tab immediately (no dirty prompt).
  // Use onMouseDown (not onClick) because React synthetic events don't
  // reliably carry the `button` property on click.
  const onTabMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (event.button === 1) {
        event.preventDefault();
        event.stopPropagation();
        api.close();
      }
    },
    [api],
  );

  const onBtnPointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
  }, []);

  // Right-click a terminal tab → rename it. Opens the prompt directly (no
  // intermediate menu). The name lives on the terminal record (customName) and
  // overrides the PTY-derived title until renamed again or the terminal closes.
  const onTabContextMenu = useCallback(
    async (event: React.MouseEvent) => {
      if (!terminalId) return;
      event.preventDefault();
      event.stopPropagation();
      const wsId = store.activeWorkspaceId;
      if (!wsId) return;
      // Only offer "Reset" when the tab actually carries a custom name —
      // resetting clears it and hands title control back to the terminal.
      const renamed = !!findTerminal(wsId, terminalId)?.customName;
      const next = await prompt({
        title: "Rename Terminal",
        label: "Terminal name",
        initialValue: api.title ?? "",
        placeholder: "Leave empty to use the automatic name",
        resetLabel: renamed ? "Reset" : undefined,
      });
      if (next === null) return; // cancelled
      renameTerminal(wsId, terminalId, next);
      if (next.trim()) api.setTitle(next.trim());
    },
    [api, terminalId],
  );

  return (
    <div
      className="dv-default-tab"
      data-testid="dockview-dv-default-tab"
      onMouseDown={onTabMouseDown}
      onDoubleClick={onTabDoubleClick}
      onContextMenu={onTabContextMenu}
    >
      <span
        className={`dv-default-tab-content${isPreview ? " preview-title" : ""}${isDeleted ? " deleted-title" : ""}`}
      >
        {isDirty && <span className="dvi-dirty-indicator">●</span>}
        {title}
      </span>
      <div
        className="dv-default-tab-action"
        onPointerDown={onBtnPointerDown}
        onClick={onClose}
      >
        <svg
          height="11"
          width="11"
          viewBox="0 0 28 28"
          aria-hidden="false"
          focusable={false}
          className="dv-svg"
        >
          <path d="M2.1 27.3L0 25.2L11.55 13.65L0 2.1L2.1 0L13.65 11.55L25.2 0L27.3 2.1L15.75 13.65L27.3 25.2L25.2 27.3L13.65 15.75L2.1 27.3Z" />
        </svg>
      </div>
    </div>
  );
}
