import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IDockviewPanelProps } from "dockview";
import { makeDockPanelApi } from "./dock-panel-kinds";
import {
  _resetAgentSurfaceRegistryForTests,
  agentSessionForPanel,
  panelControlsForAgentSession,
  panelForAgentSession,
} from "./agents/agent-surface-registry";
import {
  _resetPanelChromeRegistryForTests,
  getPanelBreadcrumb,
} from "./panel-chrome-registry";

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

describe("makeDockPanelApi — setAgentSession (RFC 0038 Session 3.2)", () => {
  beforeEach(() => _resetAgentSurfaceRegistryForTests());

  it("records the declaration against this panel's dockview id", () => {
    const api = makeDockPanelApi(fakeDockviewApi("acp-chat:p1"));
    api.setAgentSession("chat:abc");
    expect(agentSessionForPanel("acp-chat:p1")).toBe("chat:abc");
    expect(panelForAgentSession("chat:abc")).toBe("acp-chat:p1");
    // isolation: a different panel id is unaffected
    expect(agentSessionForPanel("acp-chat:p2")).toBeUndefined();
  });

  it("setAgentSession(null) withdraws it", () => {
    const api = makeDockPanelApi(fakeDockviewApi("acp-chat:p1"));
    api.setAgentSession("chat:abc");
    api.setAgentSession(null);
    expect(agentSessionForPanel("acp-chat:p1")).toBeUndefined();
    expect(panelForAgentSession("chat:abc")).toBeUndefined();
  });

  it("hands the host a close control that closes this panel — what ctx.agents.close(id) means for a Chat session", () => {
    const dv = fakeDockviewApi("acp-chat:p1");
    makeDockPanelApi(dv).setAgentSession("chat:abc");
    panelControlsForAgentSession("chat:abc")?.close();
    expect(dv.close).toHaveBeenCalledTimes(1);
  });

  it("setBreadcrumb records the crumb against this panel; null clears the path crumbs (RFC 0039)", () => {
    _resetPanelChromeRegistryForTests();
    const api = makeDockPanelApi(fakeDockviewApi("acp-chat:p1"));
    expect(getPanelBreadcrumb("acp-chat:p1")).toBeUndefined();
    api.setBreadcrumb({ filePath: "/w/proj", leafIcon: "folder" });
    expect(getPanelBreadcrumb("acp-chat:p1")).toEqual({
      filePath: "/w/proj",
      leafIcon: "folder",
    });
    api.setBreadcrumb(null);
    expect(getPanelBreadcrumb("acp-chat:p1")).toBeNull();
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
