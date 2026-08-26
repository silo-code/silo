import { describe, it, expect } from "vitest";
import {
  migrateDisabledBuiltins,
  migrateGlobalExtensionState,
  isSupersededOnDiskId,
} from "./extension-id-migration";

describe("migrateGlobalExtensionState", () => {
  it("moves the old extension bag to the new id", () => {
    const state = {
      "silo.agent-monitor": { iconMode: "color", soundEnabled: true },
    };
    expect(migrateGlobalExtensionState(state)).toBe(true);
    expect(state["silo.agents"]).toEqual({
      iconMode: "color",
      soundEnabled: true,
    });
    expect(state["silo.agent-monitor"]).toBeUndefined();
  });

  it("preserves newer keys when both bags exist", () => {
    const state = {
      "silo.agent-monitor": { iconMode: "color" },
      "silo.agents": { iconMode: "none", groupBy: "status" },
    };
    migrateGlobalExtensionState(state);
    expect(state["silo.agents"]).toEqual({
      iconMode: "none",
      groupBy: "status",
    });
  });

  it("rewrites the navigator active view prefix", () => {
    const state = {
      "core.navigator": { activeView: "silo.agent-monitor.by-status" },
    };
    migrateGlobalExtensionState(state);
    expect(state["core.navigator"].activeView).toBe("silo.agents.by-status");
  });

  it("maps retired navigator views to their replacement", () => {
    const state = {
      "core.navigator": { activeView: "silo.agent-monitor.by-workspace" },
    };
    migrateGlobalExtensionState(state);
    expect(state["core.navigator"].activeView).toBe("silo.agents.by-status");
  });

  it("is a no-op when nothing to migrate", () => {
    const state = { "silo.agents": { iconMode: "color" } };
    expect(migrateGlobalExtensionState(state)).toBe(false);
  });
});

describe("migrateDisabledBuiltins", () => {
  it("replaces superseded ids", () => {
    const { ids, changed } = migrateDisabledBuiltins([
      "silo.agent-monitor",
      "silo.file-explorer",
    ]);
    expect(changed).toBe(true);
    expect(ids.sort()).toEqual(["silo.agents", "silo.file-explorer"].sort());
  });
});

describe("isSupersededOnDiskId", () => {
  it("is true only when the replacement is a registered built-in", () => {
    const isBuiltin = (id: string) => id === "silo.agents";
    expect(isSupersededOnDiskId("silo.agent-monitor", isBuiltin)).toBe(true);
    expect(isSupersededOnDiskId("silo.agent-monitor", () => false)).toBe(false);
    expect(isSupersededOnDiskId("acme.other", isBuiltin)).toBe(false);
  });
});
