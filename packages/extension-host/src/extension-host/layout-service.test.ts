import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { DockviewApi } from "dockview";
import { getLayoutService } from "./layout-service";
import { setActiveDockApi } from "../docked/dock-api-registry";

// Fake just the slice of DockviewApi that openPanel touches: getPanel for the
// singleton existence check, addPanel returning a panel whose api.setActive
// the service must call.
function makeDockApi() {
  const panels = new Map<string, { api: { setActive: () => void } }>();
  const addPanel = vi.fn((opts: { id: string }) => {
    const panel = { api: { setActive: vi.fn() } };
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

  it("openSingletonPanel delegates to openPanel({ singleton: true })", () => {
    layout.openSingletonPanel("output", { title: "Output" });
    expect(dock.addPanel.mock.calls[0][0].id).toBe("output");

    layout.openSingletonPanel("output", { title: "Output" });
    expect(dock.addPanel).toHaveBeenCalledTimes(1);
    expect(dock.panels.get("output")!.api.setActive).toHaveBeenCalled();
  });
});
