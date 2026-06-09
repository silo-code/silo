import { useEffect, useRef } from "react";
import { useSnapshot } from "valtio";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { CenterDock } from "../panels/CenterDock";
import { SideColumn } from "./SideColumn";
import { StatusBar } from "../components/StatusBar";
import { store } from "../state/store";
import {
  restoreRegionFocus,
  trackRegionFocus,
} from "../extension-host/focus-restore";
import { installRegionTabHandoff } from "../extension-host/focus-regions";
import "./AppShell.css";

// `data-tauri-drag-region` is unreliable on macOS with `titleBarStyle:
// Overlay` (Tauri issue #9503 / #4316) — clicks while the window isn't
// already focused frequently don't initiate a drag. Calling
// `startDragging()` from a mousedown handler works around it.
function onTitlebarMouseDown(e: React.MouseEvent<HTMLDivElement>) {
  if (e.button !== 0) return;
  void getCurrentWebviewWindow().startDragging();
}

function onPanelDragging(isDragging: boolean) {
  document.body.classList.toggle("panel-resizing", isDragging);
}

export function AppShell() {
  const snap = useSnapshot(store);
  const leftRef = useRef<ImperativePanelHandle>(null);
  const rightRef = useRef<ImperativePanelHandle>(null);

  useEffect(() => {
    if (snap.leftPanelCollapsed) leftRef.current?.collapse();
    else leftRef.current?.expand();
  }, [snap.leftPanelCollapsed]);

  useEffect(() => {
    if (snap.rightPanelCollapsed) rightRef.current?.collapse();
    else rightRef.current?.expand();
  }, [snap.rightPanelCollapsed]);

  // Tabbing out of a side dock should land in the next region's entry (e.g. the
  // editor cursor), skipping the resize handle + dockview chrome between them.
  useEffect(() => installRegionTabHandoff(), []);

  // macOS eats the click that reactivates an inactive window, so restore focus
  // to the last-focused dock/panel when the window regains focus — the user
  // lands back where they were without a throwaway second click.
  useEffect(() => {
    const stopTracking = trackRegionFocus();
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void getCurrentWebviewWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) restoreRegionFocus();
      })
      .then((u) => {
        if (disposed) u();
        else unlisten = u;
      });
    return () => {
      disposed = true;
      stopTracking();
      unlisten?.();
    };
  }, []);

  // Mirror library-driven collapse (e.g. dragging a panel to the edge) back
  // into the store so the status-bar toggles stay in sync. Valtio no-ops
  // same-value assignments, so this won't fight the effects above.

  return (
    <div className="app-shell">
      <div className="titlebar-drag" onMouseDown={onTitlebarMouseDown} />
      <PanelGroup
        direction="horizontal"
        autoSaveId={
          snap.activeWorkspaceId
            ? `app:main-cols:${snap.activeWorkspaceId}`
            : "app:main-cols"
        }
      >
        <Panel
          ref={leftRef}
          defaultSize={18}
          minSize={12}
          maxSize={35}
          collapsible
          collapsedSize={0}
          onCollapse={() => {
            store.leftPanelCollapsed = true;
          }}
          onExpand={() => {
            store.leftPanelCollapsed = false;
          }}
          className="app-col"
        >
          <SideColumn location="left" />
        </Panel>
        <PanelResizeHandle onDragging={onPanelDragging} tabIndex={-1} />
        <Panel defaultSize={58} minSize={30} className="app-col">
          <CenterDock />
        </Panel>
        <PanelResizeHandle onDragging={onPanelDragging} tabIndex={-1} />
        <Panel
          ref={rightRef}
          defaultSize={24}
          minSize={12}
          maxSize={45}
          collapsible
          collapsedSize={0}
          onCollapse={() => {
            store.rightPanelCollapsed = true;
          }}
          onExpand={() => {
            store.rightPanelCollapsed = false;
          }}
          className="app-col"
        >
          <SideColumn location="right" />
        </Panel>
      </PanelGroup>
      <StatusBar />
    </div>
  );
}
