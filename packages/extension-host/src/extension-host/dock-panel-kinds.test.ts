import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { IDockviewPanelProps } from "dockview";
import type { DockPanelKind } from "@silo-code/sdk";
import {
  makeDockPanelApi,
  dockPanelKindRegistry,
  parseRecordedPanelId,
  recordedPanelId,
} from "./dock-panel-kinds";
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

  it("passes updateParameters through so a recorded panel can persist its state (RFC 0041/0042)", () => {
    const dv = fakeDockviewApi("acp-chat:p1");
    makeDockPanelApi(dv).updateParameters({ sessionId: "s-9" });
    expect(dv.updateParameters).toHaveBeenCalledWith({ sessionId: "s-9" });
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

describe("parseRecordedPanelId / recordedPanelId (RFC 0041)", () => {
  const dummy = { component: (() => null) as unknown } as Pick<
    DockPanelKind,
    "component"
  >;
  let disposers: Array<() => void> = [];

  function register(kind: DockPanelKind) {
    disposers.push(dockPanelKindRegistry.register(kind).dispose);
  }

  beforeEach(() => {
    register({
      ...dummy,
      id: "acp-chat",
      persistence: "recorded",
    } as DockPanelKind);
    register({ ...dummy, id: "web-viewer" } as DockPanelKind); // transient
  });
  afterEach(() => {
    for (const d of disposers) d();
    disposers = [];
  });

  it("round-trips a recorded kind's panel id", () => {
    const id = recordedPanelId("acp-chat", "rec-123");
    expect(id).toBe("acp-chat:rec-123");
    expect(parseRecordedPanelId(id)).toEqual({
      kindId: "acp-chat",
      recordId: "rec-123",
    });
  });

  it("is null for a kind that did not opt into persistence", () => {
    expect(parseRecordedPanelId("web-viewer:rec-1")).toBeNull();
  });

  it("is null for an unregistered kind, and for editor / terminal panels", () => {
    expect(parseRecordedPanelId("nope:rec-1")).toBeNull();
    expect(parseRecordedPanelId("editor:e1")).toBeNull();
    expect(parseRecordedPanelId("terminal:t1")).toBeNull();
  });

  it("is null for a malformed id (no colon, empty record id, leading colon)", () => {
    expect(parseRecordedPanelId("acp-chat")).toBeNull();
    expect(parseRecordedPanelId("acp-chat:")).toBeNull();
    expect(parseRecordedPanelId(":rec-1")).toBeNull();
  });

  it("keeps a record id that itself contains a colon (splits on the first only)", () => {
    expect(parseRecordedPanelId("acp-chat:a:b")).toEqual({
      kindId: "acp-chat",
      recordId: "a:b",
    });
  });
});
