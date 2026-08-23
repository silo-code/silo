import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { DockviewApi } from "dockview";
import { getLayoutService } from "./layout-service";
import { setActiveDockApi } from "../docked/dock-api-registry";
import { store } from "../state/store";
import { sidePanelRegistry } from "./side-panels";

// Fake just the slice of DockviewApi that openPanel touches: getPanel for the
// singleton existence check, addPanel returning a panel whose api.setActive
// (and api.updateParameters, for a singleton reopen) the service must call.
function makeDockApi() {
  const panels = new Map<
    string,
    { api: { setActive: () => void; updateParameters: (p: object) => void } }
  >();
  const addPanel = vi.fn((opts: { id: string }) => {
    const panel = {
      api: { setActive: vi.fn(), updateParameters: vi.fn() },
    };
    panels.set(opts.id, panel);
    return panel;
  });
  const getPanel = vi.fn((id: string) => panels.get(id));
  const api = { addPanel, getPanel } as unknown as DockviewApi;
  return { api, addPanel, getPanel, panels };
}

const layout = getLayoutService();

describe("LayoutService.openPanel", () => {
  let dock: ReturnType<typeof makeDockApi>;

  beforeEach(() => {
    dock = makeDockApi();
    setActiveDockApi(dock.api);
  });

  afterEach(() => {
    setActiveDockApi(null);
  });

  it("no-ops when there is no active dock", () => {
    setActiveDockApi(null);
    expect(() => layout.openPanel("web", { title: "Web" })).not.toThrow();
    expect(dock.addPanel).not.toHaveBeenCalled();
  });

  it("opens a new panel with a unique kind-prefixed id and activates it", () => {
    layout.openPanel("web", { title: "Web Viewer" });
    layout.openPanel("web", { title: "Web Viewer" });

    expect(dock.addPanel).toHaveBeenCalledTimes(2);
    const [first, second] = dock.addPanel.mock.calls.map((c) => c[0]);
    expect(first.id).toMatch(/^web:/);
    expect(second.id).toMatch(/^web:/);
    expect(first.id).not.toBe(second.id); // non-singleton → one instance each
    expect(first.component).toBe("web");
    expect(first.title).toBe("Web Viewer");
    const panel = dock.addPanel.mock.results[0].value;
    expect(panel.api.setActive).toHaveBeenCalled();
  });

  it("falls back to the kind id for the title when params carry none", () => {
    layout.openPanel("web");
    expect(dock.addPanel.mock.calls[0][0].title).toBe("web");
  });

  it("singleton: creates with id === kindId when absent", () => {
    layout.openPanel("output", { title: "Output" }, { singleton: true });
    expect(dock.addPanel).toHaveBeenCalledTimes(1);
    expect(dock.addPanel.mock.calls[0][0].id).toBe("output");
  });

  it("singleton: focuses the existing panel instead of adding a second", () => {
    layout.openPanel("output", { title: "Output" }, { singleton: true });
    const existing = dock.panels.get("output")!;

    layout.openPanel("output", { title: "Output" }, { singleton: true });

    expect(dock.addPanel).toHaveBeenCalledTimes(1); // no second instance
    expect(existing.api.setActive).toHaveBeenCalled();
  });

  it("singleton: forwards new params to the existing panel on reopen", () => {
    layout.openPanel("output", { title: "Output" }, { singleton: true });
    const existing = dock.panels.get("output")!;

    layout.openPanel(
      "output",
      { title: "Output", channel: "ext:silo.git" },
      { singleton: true },
    );

    expect(existing.api.updateParameters).toHaveBeenCalledWith({
      title: "Output",
      channel: "ext:silo.git",
    });
  });

  it("openSingletonPanel delegates to openPanel({ singleton: true })", () => {
    layout.openSingletonPanel("output", { title: "Output" });
    expect(dock.addPanel.mock.calls[0][0].id).toBe("output");

    layout.openSingletonPanel("output", { title: "Output" });
    expect(dock.addPanel).toHaveBeenCalledTimes(1);
    expect(dock.panels.get("output")!.api.setActive).toHaveBeenCalled();
  });
});

// These three are the public (command/`ctx.layout`) collapse path. It writes
// the *live* layout mode — on a narrow window that's small-screen mode's own
// layout, which is remembered for the next narrow window rather than folded
// into the normal-width one (see extension-host/small-screen-mode.ts).
describe("LayoutService collapse path writes the live layout mode", () => {
  beforeEach(() => {
    store.leftPanelCollapsed = true;
    store.rightPanelCollapsed = true;
    store.smallScreenActive = true;
    store.inactiveModeCollapsed = { left: false, right: false };
  });

  afterEach(() => {
    store.leftPanelCollapsed = false;
    store.rightPanelCollapsed = false;
    store.smallScreenActive = false;
    store.inactiveModeCollapsed = null;
  });

  it("setSidePanelCollapsed expands the given side only, leaving the other mode alone", () => {
    layout.setSidePanelCollapsed("left", false);
    expect(store.leftPanelCollapsed).toBe(false);
    expect(store.rightPanelCollapsed).toBe(true); // untouched
    // The normal-width layout is untouched by a change made while narrow.
    expect(store.inactiveModeCollapsed).toEqual({ left: false, right: false });
  });

  it("toggleSidePanel flips the live mode's state", () => {
    layout.toggleSidePanel("right"); // currently collapsed → expands
    expect(store.rightPanelCollapsed).toBe(false);
    expect(store.inactiveModeCollapsed).toEqual({ left: false, right: false });
  });

  it("revealSidePanel expands the panel's column", () => {
    const dispose = sidePanelRegistry.register({
      id: "test.panel",
      location: "left",
      title: "Test",
      component: () => null,
    });
    try {
      layout.revealSidePanel("test.panel");
      expect(store.leftPanelCollapsed).toBe(false);
    } finally {
      dispose.dispose();
    }
  });

  // A slot written by a build with free-form pane ids (RFC 0027). Resolving it
  // back to the registered column is what keeps reveal pointing somewhere real
  // — `"pane_7f3a".startsWith("left")` is false, so the unresolved value used
  // to expand the *right* column and stash the active tab under a key no pane
  // would ever read.
  it("revealSidePanel resolves a slot this build cannot render", () => {
    const dispose = sidePanelRegistry.register({
      id: "test.panel",
      location: "left",
      title: "Test",
      component: () => null,
    });
    store.sidePanelLocations["test.panel"] = "pane_7f3a" as never;
    try {
      layout.revealSidePanel("test.panel");
      expect(store.leftPanelCollapsed).toBe(false);
      expect(store.rightPanelCollapsed).toBe(true); // untouched
      expect(store.activeSidePanelTabs.left).toBe("test.panel");
      // Non-destructive: the override survives for the build that wrote it.
      expect(store.sidePanelLocations["test.panel"]).toBe("pane_7f3a");
    } finally {
      delete store.sidePanelLocations["test.panel"];
      delete store.activeSidePanelTabs.left;
      dispose.dispose();
    }
  });
});
