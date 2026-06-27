import { describe, it, expect } from "vitest";
import { neededMetrics } from "./poll";
import type { Settings } from "./store";

const allEnabled: Settings = {
  panels: [
    { id: "cpu", enabled: true },
    { id: "memory", enabled: true },
  ],
  statusBar: [
    { id: "cpu", enabled: true },
    { id: "memory", enabled: true },
  ],
};

describe("neededMetrics", () => {
  it("includes all ids when everything is enabled", () => {
    const needed = neededMetrics(allEnabled);
    expect(needed.has("cpu")).toBe(true);
    expect(needed.has("memory")).toBe(true);
  });

  it("includes a metric when enabled only in the panel", () => {
    const s: Settings = {
      panels: [{ id: "cpu", enabled: true }],
      statusBar: [{ id: "cpu", enabled: false }],
    };
    expect(neededMetrics(s).has("cpu")).toBe(true);
  });

  it("includes a metric when enabled only in the status bar", () => {
    const s: Settings = {
      panels: [{ id: "cpu", enabled: false }],
      statusBar: [{ id: "cpu", enabled: true }],
    };
    expect(neededMetrics(s).has("cpu")).toBe(true);
  });

  it("excludes a metric when disabled in both panel and status bar", () => {
    const s: Settings = {
      panels: [
        { id: "cpu", enabled: false },
        { id: "memory", enabled: true },
      ],
      statusBar: [
        { id: "cpu", enabled: false },
        { id: "memory", enabled: false },
      ],
    };
    const needed = neededMetrics(s);
    expect(needed.has("cpu")).toBe(false);
    expect(needed.has("memory")).toBe(true);
  });

  it("returns empty set when all items are disabled", () => {
    const s: Settings = {
      panels: [
        { id: "cpu", enabled: false },
        { id: "memory", enabled: false },
      ],
      statusBar: [
        { id: "cpu", enabled: false },
        { id: "memory", enabled: false },
      ],
    };
    expect(neededMetrics(s).size).toBe(0);
  });

  it("returns empty set for empty settings", () => {
    const s: Settings = { panels: [], statusBar: [] };
    expect(neededMetrics(s).size).toBe(0);
  });
});
