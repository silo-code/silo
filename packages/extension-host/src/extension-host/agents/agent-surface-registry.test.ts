import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  _resetAgentSurfaceRegistryForTests,
  agentSessionForPanel,
  getActiveAgentSession,
  panelControlsForAgentSession,
  panelForAgentSession,
  setActiveDockPanel,
  setPanelAgentSession,
  subscribeActiveAgentSession,
} from "./agent-surface-registry";
import { setActiveTerminal } from "../active-terminal-registry";

beforeEach(() => {
  _resetAgentSurfaceRegistryForTests();
  setActiveTerminal(null);
});

describe("panel ↔ session binding", () => {
  it("resolves both directions", () => {
    setPanelAgentSession("panel-1", "chat:abc", { close: () => {} });
    expect(agentSessionForPanel("panel-1")).toBe("chat:abc");
    expect(panelForAgentSession("chat:abc")).toBe("panel-1");
  });

  it("a panel with no declaration contributes nothing", () => {
    expect(agentSessionForPanel("panel-1")).toBeUndefined();
    expect(panelForAgentSession("chat:abc")).toBeUndefined();
  });

  it("re-declaring a different session drops the old reverse entry", () => {
    setPanelAgentSession("panel-1", "chat:abc");
    setPanelAgentSession("panel-1", "chat:def");
    expect(panelForAgentSession("chat:abc")).toBeUndefined();
    expect(panelForAgentSession("chat:def")).toBe("panel-1");
    expect(agentSessionForPanel("panel-1")).toBe("chat:def");
  });

  it("withdrawing clears both directions", () => {
    setPanelAgentSession("panel-1", "chat:abc");
    setPanelAgentSession("panel-1", null);
    expect(agentSessionForPanel("panel-1")).toBeUndefined();
    expect(panelForAgentSession("chat:abc")).toBeUndefined();
  });

  it("exposes the panel's controls by session id", () => {
    const close = vi.fn();
    setPanelAgentSession("panel-1", "chat:abc", { close });
    panelControlsForAgentSession("chat:abc")?.close();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("getActiveAgentSession", () => {
  it("is null with nothing active", () => {
    expect(getActiveAgentSession()).toBeNull();
  });

  it("reports the active terminal — a Terminal session's id is its terminal id", () => {
    setActiveTerminal("t1");
    expect(getActiveAgentSession()).toBe("t1");
  });

  it("reports the session a declaring panel is showing when it is the active panel", () => {
    setPanelAgentSession("panel-1", "chat:abc");
    setActiveDockPanel("panel-1");
    expect(getActiveAgentSession()).toBe("chat:abc");
  });

  it("is null when the active panel is not an agent surface", () => {
    setPanelAgentSession("panel-1", "chat:abc");
    setActiveDockPanel("editor:e1");
    expect(getActiveAgentSession()).toBeNull();
  });

  it("a terminal tab wins — it is the more specific signal the dock publishes", () => {
    setPanelAgentSession("panel-1", "chat:abc");
    setActiveDockPanel("terminal:t1");
    setActiveTerminal("t1");
    expect(getActiveAgentSession()).toBe("t1");
  });
});

describe("subscribeActiveAgentSession", () => {
  it("fires on an active-panel change", () => {
    setPanelAgentSession("panel-1", "chat:abc");
    const seen: (string | null)[] = [];
    subscribeActiveAgentSession((id) => seen.push(id));
    setActiveDockPanel("panel-1");
    setActiveDockPanel("editor:e1");
    expect(seen).toEqual(["chat:abc", null]);
  });

  it("fires on an active-terminal change", () => {
    const seen: (string | null)[] = [];
    subscribeActiveAgentSession((id) => seen.push(id));
    setActiveTerminal("t1");
    expect(seen).toEqual(["t1"]);
  });

  it("fires when the active panel declares a session after the fact", () => {
    setActiveDockPanel("panel-1");
    const seen: (string | null)[] = [];
    subscribeActiveAgentSession((id) => seen.push(id));
    setPanelAgentSession("panel-1", "chat:abc");
    expect(seen).toEqual(["chat:abc"]);
  });

  it("does not fire when the resolved session is unchanged", () => {
    setActiveDockPanel("panel-1");
    setPanelAgentSession("panel-1", "chat:abc");
    const listener = vi.fn();
    subscribeActiveAgentSession(listener);
    setPanelAgentSession("panel-2", "chat:def");
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops firing after dispose", () => {
    const listener = vi.fn();
    const sub = subscribeActiveAgentSession(listener);
    sub.dispose();
    setActiveTerminal("t1");
    expect(listener).not.toHaveBeenCalled();
  });
});
