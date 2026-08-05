import { useCallback, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type {
  ImperativePanelGroupHandle,
  ImperativePanelHandle,
} from "react-resizable-panels";
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
import {
  columnConstraints,
  columnLayout,
  readColumnWidths,
  widthsFromLayout,
  writeColumnWidths,
} from "./column-widths";
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

function markPanelDragging(isDragging: boolean) {
  document.body.classList.toggle("panel-resizing", isDragging);
}

// The column-width half of small-screen mode's two layout modes (the collapse
// half lives in small-screen-mode.ts). Both modes' widths — in px, see
// column-widths.ts — are read once here so the very first paint already has the
// right columns, and written back as the user drags.
const columnWidths = readColumnWidths();

export function AppShell() {
  const snap = useSnapshot(store);
  const leftRef = useRef<ImperativePanelHandle>(null);
  const rightRef = useRef<ImperativePanelHandle>(null);
  const groupRef = useRef<ImperativePanelGroupHandle>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  // The window's width in CSS px, tracked live: it's what the side columns'
  // px widths are converted against, so a window resize re-derives the layout
  // instead of rescaling the columns with it.
  const [containerPx, setContainerPx] = useState(() => window.innerWidth);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width > 0) setContainerPx(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (snap.leftPanelCollapsed) leftRef.current?.collapse();
    else leftRef.current?.expand();
  }, [snap.leftPanelCollapsed]);

  useEffect(() => {
    if (snap.rightPanelCollapsed) rightRef.current?.collapse();
    else rightRef.current?.expand();
  }, [snap.rightPanelCollapsed]);

  // Size the columns from the live mode's px widths. Declared *after* the
  // collapse effects so it lands on top of their expand(), which would
  // otherwise reopen a panel at whatever width the library last had for it.
  // Re-runs whenever the window resizes (keeping the sides put and handing the
  // difference to the center), on every collapse change (a reopened panel comes
  // back at its own width), and on a mode switch.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const widths = snap.smallScreenActive
      ? columnWidths.smallScreen
      : columnWidths.normal;
    group.setLayout(
      columnLayout(
        widths,
        {
          left: snap.leftPanelCollapsed,
          right: snap.rightPanelCollapsed,
        },
        containerPx,
      ),
    );
  }, [
    containerPx,
    snap.smallScreenActive,
    snap.leftPanelCollapsed,
    snap.rightPanelCollapsed,
  ]);

  // Record what a drag produced, for whichever mode is on screen. **Only** a
  // drag: `onLayout` also fires for the layouts we set above and for the
  // library's own re-validation against new constraints (both of which happen
  // while the window is being resized), and recording those would let a stint
  // at a narrow window permanently shrink the columns.
  const dragging = useRef(false);
  const onPanelDragging = useCallback((isDragging: boolean) => {
    dragging.current = isDragging;
    markPanelDragging(isDragging);
  }, []);

  const onColumnLayout = useCallback(
    (layout: number[]) => {
      if (!dragging.current) return;
      const mode = store.smallScreenActive ? "smallScreen" : "normal";
      const next = widthsFromLayout(layout, containerPx, columnWidths[mode]);
      if (
        next.left === columnWidths[mode].left &&
        next.right === columnWidths[mode].right
      )
        return;
      columnWidths[mode] = next;
      writeColumnWidths(columnWidths);
    },
    [containerPx],
  );

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

  // The library only takes percentages, so the px min/max become constraints
  // for *this* window width and are recomputed as it changes.
  const { sideMin, sideMax, centerMin } = columnConstraints(containerPx);
  const initial = columnLayout(
    snap.smallScreenActive ? columnWidths.smallScreen : columnWidths.normal,
    { left: snap.leftPanelCollapsed, right: snap.rightPanelCollapsed },
    containerPx,
  );

  return (
    <div className={`app-shell${isMac ? " mac" : ""}`} ref={shellRef}>
      <div
        className="titlebar-drag"
        onMouseDown={onTitlebarMouseDown}
        onDoubleClick={onTitlebarDoubleClick}
      />
      <PanelGroup
        ref={groupRef}
        direction="horizontal"
        onLayout={onColumnLayout}
      >
        <Panel
          ref={leftRef}
          defaultSize={initial[0]}
          minSize={sideMin}
          maxSize={sideMax}
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
        <Panel defaultSize={initial[1]} minSize={centerMin} className="app-col">
          <ErrorBoundary name="center-dock">
            <CenterDock />
          </ErrorBoundary>
        </Panel>
        <PanelResizeHandle onDragging={onPanelDragging} tabIndex={-1} />
        <Panel
          ref={rightRef}
          defaultSize={initial[2]}
          minSize={sideMin}
          maxSize={sideMax}
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
