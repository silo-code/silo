import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getActiveDockPanel,
  setActiveDockPanel,
  subscribeActiveDockPanel,
} from "./active-dock-panel-registry";

afterEach(() => {
  setActiveDockPanel(null);
});

describe("active-dock-panel-registry", () => {
  it("is null with nothing active", () => {
    expect(getActiveDockPanel()).toBeNull();
  });

  it("publishes the panel id and workspace id together", () => {
    setActiveDockPanel("editor:e1", "w1");
    expect(getActiveDockPanel()).toEqual({
      panelId: "editor:e1",
      workspaceId: "w1",
    });
  });

  it("defaults workspaceId to null when omitted", () => {
    setActiveDockPanel("terminal:t1");
    expect(getActiveDockPanel()).toEqual({
      panelId: "terminal:t1",
      workspaceId: null,
    });
  });

  it("clears on null regardless of workspaceId", () => {
    setActiveDockPanel("editor:e1", "w1");
    setActiveDockPanel(null);
    expect(getActiveDockPanel()).toBeNull();
  });

  it("notifies subscribers only when the pair actually changes", () => {
    const listener = vi.fn();
    const sub = subscribeActiveDockPanel(listener);

    setActiveDockPanel("editor:e1", "w1");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      panelId: "editor:e1",
      workspaceId: "w1",
    });

    // Same panel, same workspace — republishing is a no-op.
    setActiveDockPanel("editor:e1", "w1");
    expect(listener).toHaveBeenCalledTimes(1);

    // Same panel id, different workspace — a real change (e.g. a singleton
    // transient panel active in a different workspace's dock).
    setActiveDockPanel("editor:e1", "w2");
    expect(listener).toHaveBeenCalledTimes(2);

    setActiveDockPanel(null);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenLastCalledWith(null);

    sub.dispose();
  });

  it("does not notify a disposed subscriber", () => {
    const listener = vi.fn();
    subscribeActiveDockPanel(listener).dispose();
    setActiveDockPanel("editor:e1", "w1");
    expect(listener).not.toHaveBeenCalled();
  });
});
