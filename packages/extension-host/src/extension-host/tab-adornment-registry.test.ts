import { beforeEach, describe, expect, it, vi } from "vitest";
import { tabAdornmentRegistry } from "./tab-adornment-registry";

describe("tabAdornmentRegistry", () => {
  beforeEach(() => {
    tabAdornmentRegistry._resetForTests();
  });

  it("stacks set indicators and binders in order", () => {
    tabAdornmentRegistry.setIndicator("terminal", "t1", {
      id: "a",
      icon: "Flag",
      color: "ok",
    });
    const d = tabAdornmentRegistry.bindIndicator("terminal", {
      id: "b",
      provide: (id) => (id === "t1" ? { icon: "Star", color: "warn" } : null),
    });
    expect(tabAdornmentRegistry.getIndicators("terminal", "t1")).toEqual([
      { id: "a", icon: "Flag", color: "ok" },
      { id: "b", icon: "Star", color: "warn" },
    ]);
    expect(tabAdornmentRegistry.getIndicators("editor", "t1")).toEqual([]);
    d.dispose();
    expect(tabAdornmentRegistry.getIndicators("terminal", "t1")).toEqual([
      { id: "a", icon: "Flag", color: "ok" },
    ]);
  });

  it("stacks activities independently of indicators", () => {
    tabAdornmentRegistry.setActivity("editor", "e1", {
      id: "run",
      activity: "working",
      tooltip: "Building",
    });
    const d = tabAdornmentRegistry.bindActivity("editor", {
      id: "attn",
      provide: (id) =>
        id === "e1" ? { activity: "warn", tooltip: "Careful" } : null,
    });
    expect(tabAdornmentRegistry.getActivities("editor", "e1")).toEqual([
      { id: "run", activity: "working", tooltip: "Building" },
      { id: "attn", activity: "warn", tooltip: "Careful" },
    ]);
    d.dispose();
    tabAdornmentRegistry.clearActivity("editor", "e1", "run");
    expect(tabAdornmentRegistry.getActivities("editor", "e1")).toEqual([]);
  });

  it("clearIcon / clearIndicator remove only that id", () => {
    tabAdornmentRegistry.setIcon("editor", "e1", {
      id: "logo",
      icon: "X",
    });
    tabAdornmentRegistry.setIcon("editor", "e1", {
      id: "other",
      icon: "Y",
    });
    tabAdornmentRegistry.clearIcon("editor", "e1", "logo");
    expect(tabAdornmentRegistry.getIcons("editor", "e1")).toEqual([
      { id: "other", icon: "Y" },
    ]);
  });

  it("shims terminal-only decoration providers onto indicators", () => {
    const d = tabAdornmentRegistry.registerTerminalDecorationShim({
      id: "shim",
      provide: (id) => (id === "term_x" ? { icon: "Lightning" } : null),
    });
    expect(tabAdornmentRegistry.getIndicators("terminal", "term_x")).toEqual([
      { id: "shim", icon: "Lightning" },
    ]);
    expect(tabAdornmentRegistry.getIndicators("editor", "term_x")).toEqual([]);
    expect(tabAdornmentRegistry.getFirstTerminalIndicator("term_x")).toEqual({
      icon: "Lightning",
    });
    d.dispose();
  });

  it("flashActivity auto-clears after durationMs", () => {
    vi.useFakeTimers();
    tabAdornmentRegistry.flashActivity("editor", "e1", {
      activity: "error",
      durationMs: 500,
    });
    expect(tabAdornmentRegistry.getActivities("editor", "e1")).toHaveLength(1);
    vi.advanceTimersByTime(500);
    expect(tabAdornmentRegistry.getActivities("editor", "e1")).toEqual([]);
    vi.useRealTimers();
  });

  it("getHighlight returns null when nothing contributed", () => {
    expect(tabAdornmentRegistry.getHighlight("editor", "e1")).toBeNull();
  });

  it("setHighlight / clearHighlight round-trip", () => {
    tabAdornmentRegistry.setHighlight("editor", "e1", {
      id: "acme.title",
      color: "warn",
    });
    expect(tabAdornmentRegistry.getHighlight("editor", "e1")).toEqual({
      id: "acme.title",
      color: "warn",
    });
    tabAdornmentRegistry.clearHighlight("editor", "e1", "acme.title");
    expect(tabAdornmentRegistry.getHighlight("editor", "e1")).toBeNull();
  });

  it("a direct setHighlight wins over a bindHighlight contribution", () => {
    tabAdornmentRegistry.setHighlight("editor", "e1", {
      id: "direct",
      color: "ok",
    });
    tabAdornmentRegistry.bindHighlight("editor", {
      id: "bound",
      provide: () => ({ color: "error" }),
    });
    expect(tabAdornmentRegistry.getHighlight("editor", "e1")).toEqual({
      id: "direct",
      color: "ok",
    });
  });

  it("bindHighlight is scoped by kind and disposes cleanly", () => {
    const d = tabAdornmentRegistry.bindHighlight("terminal", {
      id: "acme.title",
      provide: (id) => (id === "t1" ? { color: "accent" } : null),
    });
    expect(tabAdornmentRegistry.getHighlight("terminal", "t1")).toEqual({
      id: "acme.title",
      color: "accent",
    });
    expect(tabAdornmentRegistry.getHighlight("editor", "t1")).toBeNull();
    d.dispose();
    expect(tabAdornmentRegistry.getHighlight("terminal", "t1")).toBeNull();
  });

  it("notifies subscribers on set/bind/invalidate", () => {
    let n = 0;
    const sub = tabAdornmentRegistry.subscribe(() => {
      n += 1;
    });
    tabAdornmentRegistry.setIndicator("terminal", "t", {
      id: "x",
      icon: "Flag",
    });
    expect(n).toBe(1);
    const d = tabAdornmentRegistry.bindIndicator("terminal", {
      id: "n",
      provide: () => null,
    });
    expect(n).toBe(2);
    tabAdornmentRegistry.invalidate();
    expect(n).toBe(3);
    d.dispose();
    expect(n).toBe(4);
    sub.dispose();
  });
});
