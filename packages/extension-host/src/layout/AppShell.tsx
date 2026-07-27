import { useEffect, useRef } from "react";
import { useSnapshot } from "valtio";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { CenterDock } from "../panels/CenterDock";
import { SideColumn } from "./SideColumn";
import { StatusBar } from "../components/StatusBar";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { store } from "../state/store";
import {
  restoreRegionFocus,
  trackRegionFocus,
} from "../extension-host/focus-restore";
import { installRegionTabHandoff } from "../extension-host/focus-regions";
import {
  installSmallScreenMode,
  beginPeekResize,
} from "../extension-host/small-screen-mode";
import "./AppShell.css";

// On macOS, `titleBarStyle: "Overlay"` causes the webview to extend under the
// native traffic lights, so we need a reserved drag strip at the top. On
// Linux/Windows the OS title bar sits above the webview — no reservation needed.
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

// `data-tauri-drag-region` is unreliable on macOS with `titleBarStyle:
// Overlay` (Tauri issue #9503 / #4316) — clicks while the window isn't
// already focused frequently don't initiate a drag. Calling
// `startDragging()` from a mousedown handler works around it.
// Calling `startDragging()` on mousedown enters AppKit's modal window-drag
// loop, which swallows every following pointer event — including the second
// mousedown of a double-click. So we defer it: arm mousemove/mouseup listeners
// on mousedown and only start dragging once the pointer travels past a small
// threshold. A pure click never enters the drag loop, leaving the native
// `dblclick` (-> zoom) free to fire.
const DRAG_THRESHOLD_PX = 4;

function onTitlebarMouseDown(e: React.MouseEvent<HTMLDivElement>) {
  if (e.button !== 0) return;
  const startX = e.screenX;
  const startY = e.screenY;

  const cleanup = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", cleanup);
  };
  const onMove = (ev: MouseEvent) => {
    if (
      Math.abs(ev.screenX - startX) > DRAG_THRESHOLD_PX ||
      Math.abs(ev.screenY - startY) > DRAG_THRESHOLD_PX
    ) {
      cleanup();
      void getCurrentWebviewWindow().startDragging();
    }
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", cleanup);
}

// Double-clicking the title bar zooms the window to fill the screen, matching
// the native macOS green-button / title-bar behavior. `toggleMaximize` maps to
// AppKit's zoom, not true fullscreen.
function onTitlebarDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
  if (e.button !== 0) return;
  getCurrentWebviewWindow()
    .toggleMaximize()
    .catch((err: unknown) => {
      // A rejection here is almost always a missing Tauri capability
      // (`core:window:allow-toggle-maximize`) — surface it rather than swallow.
      console.error("titlebar double-click: toggleMaximize failed", err);
    });
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

  // Small screen mode: auto-hide/auto-restore side panels by window width,
  // plus the edge-hover peek. See extension-host/small-screen-mode.ts.
  useEffect(() => installSmallScreenMode(), []);

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
    <div className={`app-shell${isMac ? " mac" : ""}`}>
      <div
        className="titlebar-drag"
        onMouseDown={onTitlebarMouseDown}
        onDoubleClick={onTitlebarDoubleClick}
      />
      <PanelGroup direction="horizontal" autoSaveId="app:main-cols">
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
          className={`app-col${snap.leftPanelPeeking ? " app-col--peeking" : ""}`}
        >
          <div
            className={`side-peek-host side-peek-host--left${
              snap.leftPanelPeeking ? " peeking" : ""
            }`}
            style={
              snap.leftPanelPeeking
                ? ({
                    "--peek-width": `${snap.smallScreenPeekWidthLeftPx}px`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            <ErrorBoundary name="side-left">
              <SideColumn location="left" />
            </ErrorBoundary>
            {snap.leftPanelPeeking && (
              <div
                className={`peek-resize-handle${snap.leftPanelPeekDragging ? " dragging" : ""}`}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  beginPeekResize("left", e.clientX);
                }}
              />
            )}
          </div>
        </Panel>
        <PanelResizeHandle onDragging={onPanelDragging} tabIndex={-1} />
        <Panel defaultSize={58} minSize={30} className="app-col">
          <ErrorBoundary name="center-dock">
            <CenterDock />
          </ErrorBoundary>
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
          className={`app-col${snap.rightPanelPeeking ? " app-col--peeking" : ""}`}
        >
          <div
            className={`side-peek-host side-peek-host--right${
              snap.rightPanelPeeking ? " peeking" : ""
            }`}
            style={
              snap.rightPanelPeeking
                ? ({
                    "--peek-width": `${snap.smallScreenPeekWidthRightPx}px`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {snap.rightPanelPeeking && (
              <div
                className={`peek-resize-handle${snap.rightPanelPeekDragging ? " dragging" : ""}`}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  beginPeekResize("right", e.clientX);
                }}
              />
            )}
            <ErrorBoundary name="side-right">
              <SideColumn location="right" />
            </ErrorBoundary>
          </div>
        </Panel>
      </PanelGroup>
      <StatusBar />
    </div>
  );
}
