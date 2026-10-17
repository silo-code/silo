import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
} from "dockview";
import type { Disposable, DockPanelProps } from "@silo-code/sdk";
import {
  dockPanelKindRegistry,
  getDockComponents,
} from "../extension-host/dock-panel-kinds";
import { DockWorkspaceProvider } from "./DockWorkspaceContext";

// dockview measures itself on mount; jsdom has no ResizeObserver.
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let seen: string[] = [];
let kind: Disposable | null = null;

/** Stands in for TerminalPanel: records the `workspaceId` the host hands it. */
function Probe(props: DockPanelProps) {
  seen.push(props.workspaceId);
  return <div className="probe" />;
}

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    NoopResizeObserver;
  seen = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  // The real `terminal` kind (packages/extensions-core/src/terminal/index.tsx)
  // declares `toolbar`, so its panel is framed by DockPanelChrome — the
  // `surface: "panel"` toolbar target is fed the same `workspaceId` the
  // component is.
  kind = dockPanelKindRegistry.register({
    id: "terminal",
    component: Probe,
    toolbar: { breadcrumb: true },
  });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  kind?.dispose();
  kind = null;
});

function mount(workspaceId: string, onReady: (e: DockviewReadyEvent) => void) {
  act(() => {
    root!.render(
      <DockWorkspaceProvider workspaceId={workspaceId}>
        <DockviewReact components={getDockComponents()} onReady={onReady} />
      </DockWorkspaceProvider>,
    );
  });
}

describe("a dock panel's workspace", () => {
  it("reports the dock's workspace for a terminal added live", () => {
    mount("ws-1", (e) => {
      e.api.addPanel({
        id: "terminal:t1",
        component: "terminal",
        params: { terminalId: "t1" },
      });
    });
    expect(seen).not.toHaveLength(0);
    expect(seen.at(-1)).toBe("ws-1");
  });

  it("reports the dock's workspace for a terminal restored from a saved layout", () => {
    // Capture a real layout snapshot the way WorkspaceDock persists one…
    let saved: object | null = null;
    mount("ws-1", (e) => {
      e.api.addPanel({
        id: "terminal:t1",
        component: "terminal",
        params: { terminalId: "t1" },
      });
      saved = e.api.toJSON();
    });
    act(() => root!.unmount());
    root = createRoot(host!);
    seen = [];

    // …then bring it back through `fromJSON`, the app-startup path. dockview's
    // deserializer builds each restored panel with its own fresh `DockviewApi`
    // wrapper (not the component's shared one), so anything keyed on that
    // object's identity misses for exactly these panels.
    mount("ws-1", (e) => {
      e.api.fromJSON(saved as Parameters<DockviewApi["fromJSON"]>[0]);
    });
    expect(seen).not.toHaveLength(0);
    expect(seen.at(-1)).toBe("ws-1");
  });
});
