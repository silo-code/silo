import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IDockviewPanelProps } from "dockview";
import { makeDockPanelApi } from "./dock-panel-kinds";
import { tabAdornmentRegistry } from "./tab-adornment-registry";

type DockviewPanelApi = IDockviewPanelProps["api"];

function fakeDockviewApi(id: string): DockviewPanelApi {
  return {
    id,
    isActive: true,
    isVisible: true,
    setTitle: vi.fn(),
    close: vi.fn(),
    setActive: vi.fn(),
    updateParameters: vi.fn(),
    onDidActiveChange: vi.fn(() => ({ dispose: vi.fn() })),
    onDidVisibilityChange: vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as DockviewPanelApi;
}

describe("makeDockPanelApi — panel-tab adornments (RFC 0038 Session 3.1)", () => {
  beforeEach(() => tabAdornmentRegistry._resetForTests());

  it("setTabActivity records under the 'panel' kind keyed by the panel id", () => {
    const api = makeDockPanelApi(fakeDockviewApi("acp-chat:p1"));
    api.setTabActivity({ activity: "working", tooltip: "Agent working" });

    const activities = tabAdornmentRegistry.getActivities(
      "panel",
      "acp-chat:p1",
    );
    expect(activities).toEqual([
      {
        id: "silo.dock-panel.self",
        activity: "working",
        tooltip: "Agent working",
      },
    ]);
    // isolation: a different panel id is unaffected
    expect(tabAdornmentRegistry.getActivities("panel", "acp-chat:p2")).toEqual(
      [],
    );
  });

  it("setTabActivity(null) / setTabIcon(null) clear the panel's own adornment", () => {
    const api = makeDockPanelApi(fakeDockviewApi("acp-chat:p1"));
    api.setTabActivity({ activity: "ready" });
    api.setTabIcon({ icon: "x" });
    expect(
      tabAdornmentRegistry.getActivities("panel", "acp-chat:p1"),
    ).toHaveLength(1);
    expect(tabAdornmentRegistry.getIcons("panel", "acp-chat:p1")).toHaveLength(
      1,
    );

    api.setTabActivity(null);
    api.setTabIcon(null);
    expect(tabAdornmentRegistry.getActivities("panel", "acp-chat:p1")).toEqual(
      [],
    );
    expect(tabAdornmentRegistry.getIcons("panel", "acp-chat:p1")).toEqual([]);
  });

  it("delegates the plain DockPanelApi verbs to the dockview api", () => {
    const dv = fakeDockviewApi("acp-chat:p1");
    const api = makeDockPanelApi(dv);
    api.setTitle("Claude");
    api.setActive();
    api.updateParameters({ profileId: "c1" });
    expect(dv.setTitle).toHaveBeenCalledWith("Claude");
    expect(dv.setActive).toHaveBeenCalled();
    expect(dv.updateParameters).toHaveBeenCalledWith({ profileId: "c1" });
    expect(api.isActive).toBe(true);
    expect(api.isVisible).toBe(true);
  });
});
