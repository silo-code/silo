import { describe, it, expect } from "vitest";
import { migratePanelIds } from "./panel-id-migration";
import type { WorkspaceInternal } from "./types";

function ws(over: Partial<WorkspaceInternal> = {}): WorkspaceInternal {
  return {
    id: "ws_1",
    name: "proj",
    folder: "/tmp/proj",
    createdAt: "2026-01-01T00:00:00Z",
    lastOpenedAt: "2026-01-01T00:00:00Z",
    terminals: [],
    editors: [],
    ...over,
  } as WorkspaceInternal;
}

describe("workspaces → navigator", () => {
  it("moves the panel's slot override", () => {
    const out = migratePanelIds(
      ws({ sidePanelLocations: { workspaces: "right" } }),
    );
    expect(out.sidePanelLocations).toEqual({ navigator: "right" });
  });

  it("moves order, scroll, visibility and the panel's storage bag", () => {
    const out = migratePanelIds(
      ws({
        sidePanelOrder: { workspaces: 3, "silo.git": 1 },
        sidePanelScrollPositions: { workspaces: 240 },
        sidePanelVisibility: { workspaces: false },
        extensionState: { workspaces: { expanded: true } },
      }),
    );
    expect(out.sidePanelOrder).toEqual({ "silo.git": 1, navigator: 3 });
    expect(out.sidePanelScrollPositions).toEqual({ navigator: 240 });
    expect(out.sidePanelVisibility).toEqual({ navigator: false });
    expect(out.extensionState).toEqual({ navigator: { expanded: true } });
  });

  it("rewrites active-tab values, which hold panel ids rather than keys", () => {
    const out = migratePanelIds(
      ws({ activeSidePanelTabs: { left: "workspaces", right: "silo.git" } }),
    );
    expect(out.activeSidePanelTabs).toEqual({
      left: "navigator",
      right: "silo.git",
    });
  });

  it("leaves other panels' entries alone", () => {
    const out = migratePanelIds(
      ws({ sidePanelVisibility: { "silo.git": false, workspaces: true } }),
    );
    expect(out.sidePanelVisibility).toEqual({
      "silo.git": false,
      navigator: true,
    });
  });
});

describe("idempotence and edges", () => {
  it("is a no-op the second time", () => {
    const once = migratePanelIds(ws({ sidePanelOrder: { workspaces: 3 } }));
    const twice = migratePanelIds(once);
    expect(twice.sidePanelOrder).toEqual({ navigator: 3 });
    expect(twice).toBe(once);
  });

  it("returns the same object when there is nothing to migrate", () => {
    const record = ws({ sidePanelOrder: { "silo.git": 1 } });
    expect(migratePanelIds(record)).toBe(record);
  });

  it("keeps the newer value when both ids are present", () => {
    // Downgraded, used the old build, then upgraded again: the navigator entry
    // is the one the user last interacted with.
    const out = migratePanelIds(
      ws({ sidePanelOrder: { workspaces: 3, navigator: 7 } }),
    );
    expect(out.sidePanelOrder).toEqual({ navigator: 7 });
  });

  it("tolerates a record with no panel state at all", () => {
    const record = ws();
    expect(() => migratePanelIds(record)).not.toThrow();
    expect(migratePanelIds(record)).toBe(record);
  });
});
