import { describe, it, expect, afterEach, vi } from "vitest";
import type { WorkspaceInternal } from "../state/types";

const { focusDockPanel } = vi.hoisted(() => ({ focusDockPanel: vi.fn() }));
vi.mock("./focus-dock-panel", () => ({ focusDockPanel }));

import { store } from "../state/store";
import { addPanelRecord } from "../state/workspaces";
import { setActiveDockPanel } from "./active-dock-panel-registry";
import { dockPanelKindRegistry } from "./dock-panel-kinds";
import { getPanelService } from "./panel-service";
import { tabAdornmentRegistry } from "./tab-adornment-registry";

describe("getPanelService", () => {
  it("returns the same instance on every call", () => {
    expect(getPanelService()).toBe(getPanelService());
  });

  it('scopes adornments to the "panel" kind, isolated from editor/terminal', () => {
    const svc = getPanelService();
    svc.setHighlight("silo.agents-chat-panel:p1", {
      id: "acme.follow-up",
      color: "warn",
    });
    expect(svc.getHighlight("silo.agents-chat-panel:p1")).toEqual({
      id: "acme.follow-up",
      color: "warn",
    });
    expect(
      tabAdornmentRegistry.getHighlight("panel", "silo.agents-chat-panel:p1"),
    ).toEqual({ id: "acme.follow-up", color: "warn" });
    expect(
      tabAdornmentRegistry.getHighlight("editor", "silo.agents-chat-panel:p1"),
    ).toBeNull();
    svc.clearHighlight("silo.agents-chat-panel:p1", "acme.follow-up");
  });
});

describe("PanelService.focus", () => {
  afterEach(() => {
    for (const id of Object.keys(store.workspaces)) delete store.workspaces[id];
    focusDockPanel.mockReset();
  });

  it("resolves the owning workspace from the record and delegates to focusDockPanel", () => {
    const dispose = dockPanelKindRegistry.register({
      id: "silo.agents-chat-panel",
      component: () => null,
      persistence: "recorded",
    }).dispose;
    store.workspaces.w = {
      id: "w",
      name: "w",
      folder: "/ws/w",
      createdAt: "",
      lastOpenedAt: "",
      terminals: [],
      editors: [],
      panels: [],
      dockLayout: null,
    } as unknown as WorkspaceInternal;
    const rec = addPanelRecord("w", {
      id: "p1",
      kindId: "silo.agents-chat-panel",
    });

    getPanelService().focus(rec.panelId);
    expect(focusDockPanel).toHaveBeenCalledWith("w", rec.panelId);
    dispose();
  });

  it("is a no-op for a panel id that names no record", () => {
    getPanelService().focus("silo.agents-chat-panel:ghost");
    expect(focusDockPanel).not.toHaveBeenCalled();
  });

  it("is a no-op for a panel id that isn't kind:id shaped", () => {
    getPanelService().focus("nocolon");
    expect(focusDockPanel).not.toHaveBeenCalled();
  });
});

describe("PanelService.getState / subscribe", () => {
  afterEach(() => {
    setActiveDockPanel(null);
  });

  it("is null when nothing is active", () => {
    expect(getPanelService().getState()).toBeNull();
  });

  it("is null when the active tab is an editor or a terminal", () => {
    setActiveDockPanel("editor:e1", "w");
    expect(getPanelService().getState()).toBeNull();
    setActiveDockPanel("terminal:t1", "w");
    expect(getPanelService().getState()).toBeNull();
  });

  it("reports a recorded panel's kindId, workspaceId, and recordId", () => {
    const dispose = dockPanelKindRegistry.register({
      id: "silo.agents-chat-panel",
      component: () => null,
      persistence: "recorded",
    }).dispose;
    setActiveDockPanel("silo.agents-chat-panel:p1", "w");
    expect(getPanelService().getState()).toEqual({
      panelId: "silo.agents-chat-panel:p1",
      kindId: "silo.agents-chat-panel",
      workspaceId: "w",
      recordId: "p1",
    });
    dispose();
  });

  it("omits recordId for a transient (unrecorded) panel", () => {
    setActiveDockPanel("core.picker", "w");
    expect(getPanelService().getState()).toEqual({
      panelId: "core.picker",
      kindId: "core.picker",
      workspaceId: "w",
      recordId: undefined,
    });
  });

  it("is referentially stable across repeated reads with nothing changed", () => {
    setActiveDockPanel("core.picker", "w");
    const svc = getPanelService();
    expect(svc.getState()).toBe(svc.getState());
  });

  it("notifies subscribers when the active panel changes, not on every registry tick", () => {
    const svc = getPanelService();
    const listener = vi.fn();
    const sub = svc.subscribe(listener);

    setActiveDockPanel("editor:e1", "w"); // editor -> still null, but a real tick
    expect(listener).not.toHaveBeenCalled(); // null -> null is not a change

    setActiveDockPanel("core.picker", "w");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      panelId: "core.picker",
      kindId: "core.picker",
      workspaceId: "w",
      recordId: undefined,
    });

    setActiveDockPanel("editor:e1", "w");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(null);

    sub.dispose();
  });
});
