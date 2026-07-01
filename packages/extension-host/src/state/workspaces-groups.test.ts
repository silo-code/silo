import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./editor-backups", () => ({
  clearEditorBackup: vi.fn(() => Promise.resolve()),
}));

// Tauri dialog is not available in tests
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({ basename: vi.fn() }));

import { store } from "./store";
import type { WorkspaceGroup } from "./types";
import {
  createGroup,
  renameGroup,
  setGroupColor,
  deleteGroup,
  reorderPanel,
  moveWorkspaceToGroup,
  removeWorkspaceFromGroup,
  ungroupWorkspace,
  reorderWorkspaceInGroup,
  toggleGroupCollapsed,
  groupIdForWorkspace,
  workspaceGroupMap,
  createWorkspace,
  deleteWorkspace,
} from "./workspaces";

function makeGroup(name: string): WorkspaceGroup {
  return createGroup(name);
}

beforeEach(() => {
  store.workspaces = {};
  store.workspaceOrder = [];
  store.activeWorkspaceId = null;
  store.groups = {};
  store.panelOrder = [];
});

// ── createGroup ──────────────────────────────────────────────────────────────

describe("createGroup", () => {
  it("adds the group to store.groups keyed by its id", () => {
    const group = createGroup("Work");
    expect(store.groups[group.id]).toBeDefined();
    expect(store.groups[group.id].name).toBe("Work");
    expect(store.groups[group.id].collapsed).toBe(false);
    expect(store.groups[group.id].workspaceOrder).toEqual([]);
  });

  it("appends the group id to panelOrder (a top-level entry)", () => {
    const a = createGroup("A");
    const b = createGroup("B");
    expect(store.panelOrder).toEqual([a.id, b.id]);
  });

  it("returns the new group object", () => {
    const group = createGroup("Test");
    expect(group.id).toMatch(/^grp_/);
    expect(group.name).toBe("Test");
  });
});

// ── setGroupColor ──────────────────────────────────────────────────────────────

describe("setGroupColor", () => {
  it("sets the color on a group", () => {
    const group = makeGroup("G");
    setGroupColor(group.id, "#e06c75");
    expect(store.groups[group.id].color).toBe("#e06c75");
  });

  it("clears the color when passed undefined", () => {
    const group = makeGroup("G");
    setGroupColor(group.id, "#e06c75");
    setGroupColor(group.id, undefined);
    expect(store.groups[group.id].color).toBeUndefined();
  });

  it("no-ops for an unknown id", () => {
    expect(() => setGroupColor("grp_unknown", "#e06c75")).not.toThrow();
  });
});

// ── renameGroup ──────────────────────────────────────────────────────────────

describe("renameGroup", () => {
  it("updates the group name", () => {
    const group = makeGroup("Old");
    renameGroup(group.id, "New");
    expect(store.groups[group.id].name).toBe("New");
  });

  it("no-ops for an unknown id", () => {
    expect(() => renameGroup("grp_unknown", "x")).not.toThrow();
  });
});

// ── deleteGroup ──────────────────────────────────────────────────────────────

describe("deleteGroup", () => {
  it("removes the group from groups and panelOrder", () => {
    const a = makeGroup("A");
    const b = makeGroup("B");
    deleteGroup(a.id);
    expect(store.groups[a.id]).toBeUndefined();
    expect(store.panelOrder).toEqual([b.id]);
  });

  it("splices its members back into panelOrder at the group's slot", () => {
    const ws = createWorkspace({ folder: "/p", name: "p" }); // panelOrder: [ws]
    const group = makeGroup("G"); // panelOrder: [ws, group]
    moveWorkspaceToGroup(ws.id, group.id); // panelOrder: [group]; ws inside group
    expect(store.panelOrder).toEqual([group.id]);
    deleteGroup(group.id);
    // The member reappears at the group's former position, now ungrouped.
    expect(store.panelOrder).toEqual([ws.id]);
    expect(groupIdForWorkspace(ws.id)).toBeUndefined();
  });

  it("no-ops for an unknown id", () => {
    expect(() => deleteGroup("grp_unknown")).not.toThrow();
  });
});

// ── reorderPanel (interleaved top-level order) ───────────────────────────────

describe("reorderPanel", () => {
  it("reorders groups relative to each other", () => {
    const a = makeGroup("A");
    const b = makeGroup("B");
    const c = makeGroup("C");
    reorderPanel(c.id, a.id, "before");
    expect(store.panelOrder).toEqual([c.id, a.id, b.id]);
  });

  it("moves a group above an ungrouped workspace (full interleave)", () => {
    const ws = createWorkspace({ folder: "/p", name: "p" }); // [ws]
    const group = makeGroup("G"); // [ws, group]
    reorderPanel(group.id, ws.id, "before");
    expect(store.panelOrder).toEqual([group.id, ws.id]);
  });

  it("no-ops when fromId === toId", () => {
    const a = makeGroup("A");
    const b = makeGroup("B");
    reorderPanel(a.id, a.id, "before");
    expect(store.panelOrder).toEqual([a.id, b.id]);
  });

  it("no-ops when fromId is not in panelOrder", () => {
    const a = makeGroup("A");
    const b = makeGroup("B");
    reorderPanel("grp_ghost", b.id, "before");
    expect(store.panelOrder).toEqual([a.id, b.id]);
  });
});

// ── moveWorkspaceToGroup ─────────────────────────────────────────────────────

describe("moveWorkspaceToGroup", () => {
  it("adds to the group and removes the workspace from the top-level panel", () => {
    const group = makeGroup("G");
    const ws = createWorkspace({ folder: "/p", name: "p" });
    expect(store.panelOrder).toContain(ws.id);
    moveWorkspaceToGroup(ws.id, group.id);
    expect(groupIdForWorkspace(ws.id)).toBe(group.id);
    expect(store.groups[group.id].workspaceOrder).toContain(ws.id);
    expect(store.panelOrder).not.toContain(ws.id);
  });

  it("moves a workspace from one group to another", () => {
    const g1 = makeGroup("G1");
    const g2 = makeGroup("G2");
    const ws = createWorkspace({ folder: "/p", name: "p" });
    moveWorkspaceToGroup(ws.id, g1.id);
    moveWorkspaceToGroup(ws.id, g2.id);
    expect(store.groups[g1.id].workspaceOrder).not.toContain(ws.id);
    expect(store.groups[g2.id].workspaceOrder).toContain(ws.id);
    expect(groupIdForWorkspace(ws.id)).toBe(g2.id);
  });

  it("does not duplicate the workspace in the group order", () => {
    const group = makeGroup("G");
    const ws = createWorkspace({ folder: "/p", name: "p" });
    moveWorkspaceToGroup(ws.id, group.id);
    moveWorkspaceToGroup(ws.id, group.id);
    expect(
      store.groups[group.id].workspaceOrder.filter((id) => id === ws.id),
    ).toHaveLength(1);
  });

  it("no-ops for an unknown group id", () => {
    const ws = createWorkspace({ folder: "/p", name: "p" });
    expect(() => moveWorkspaceToGroup(ws.id, "grp_ghost")).not.toThrow();
    expect(groupIdForWorkspace(ws.id)).toBeUndefined();
    expect(store.panelOrder).toContain(ws.id);
  });

  it("inserts at the anchor position when one is given", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    const c = createWorkspace({ folder: "/c", name: "c" });
    moveWorkspaceToGroup(a.id, group.id);
    moveWorkspaceToGroup(b.id, group.id);
    moveWorkspaceToGroup(c.id, group.id, { toId: a.id, position: "before" });
    expect(store.groups[group.id].workspaceOrder).toEqual([c.id, a.id, b.id]);
  });
});

// ── ungroupWorkspace ─────────────────────────────────────────────────────────

describe("ungroupWorkspace", () => {
  it("pulls a workspace out of its group back into panelOrder after the group", () => {
    const ws = createWorkspace({ folder: "/p", name: "p" });
    const group = makeGroup("G"); // panelOrder: [ws, group]
    moveWorkspaceToGroup(ws.id, group.id); // panelOrder: [group]
    ungroupWorkspace(ws.id);
    expect(groupIdForWorkspace(ws.id)).toBeUndefined();
    // Reappears just after its former group.
    expect(store.panelOrder).toEqual([group.id, ws.id]);
  });

  it("positions at the anchor when one is provided", () => {
    const top = createWorkspace({ folder: "/top", name: "top" }); // [top]
    const ws = createWorkspace({ folder: "/p", name: "p" }); // [top, ws]
    const group = makeGroup("G"); // [top, ws, group]
    moveWorkspaceToGroup(ws.id, group.id); // [top, group]
    ungroupWorkspace(ws.id, { toId: top.id, position: "before" });
    expect(store.panelOrder).toEqual([ws.id, top.id, group.id]);
  });

  it("no-ops when the workspace is not in any group", () => {
    const ws = createWorkspace({ folder: "/p", name: "p" });
    expect(() => ungroupWorkspace(ws.id)).not.toThrow();
    expect(store.panelOrder).toEqual([ws.id]);
  });
});

// ── removeWorkspaceFromGroup (membership-only primitive) ─────────────────────

describe("removeWorkspaceFromGroup", () => {
  it("removes the workspace from the group and clears the reverse lookup", () => {
    const group = makeGroup("G");
    const ws = createWorkspace({ folder: "/p", name: "p" });
    moveWorkspaceToGroup(ws.id, group.id);
    removeWorkspaceFromGroup(ws.id);
    expect(groupIdForWorkspace(ws.id)).toBeUndefined();
    expect(store.groups[group.id].workspaceOrder).not.toContain(ws.id);
  });

  it("no-ops when the workspace is not in any group", () => {
    const ws = createWorkspace({ folder: "/p", name: "p" });
    expect(() => removeWorkspaceFromGroup(ws.id)).not.toThrow();
    expect(groupIdForWorkspace(ws.id)).toBeUndefined();
  });
});

// ── reorderWorkspaceInGroup ──────────────────────────────────────────────────

describe("reorderWorkspaceInGroup", () => {
  it("moves a workspace before another within the group", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    const c = createWorkspace({ folder: "/c", name: "c" });
    moveWorkspaceToGroup(a.id, group.id);
    moveWorkspaceToGroup(b.id, group.id);
    moveWorkspaceToGroup(c.id, group.id);
    reorderWorkspaceInGroup(group.id, c.id, a.id, "before");
    expect(store.groups[group.id].workspaceOrder).toEqual([c.id, a.id, b.id]);
  });

  it("moves a workspace after another within the group", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    const c = createWorkspace({ folder: "/c", name: "c" });
    moveWorkspaceToGroup(a.id, group.id);
    moveWorkspaceToGroup(b.id, group.id);
    moveWorkspaceToGroup(c.id, group.id);
    reorderWorkspaceInGroup(group.id, a.id, c.id, "after");
    expect(store.groups[group.id].workspaceOrder).toEqual([b.id, c.id, a.id]);
  });

  it("no-ops when fromId === toId", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    moveWorkspaceToGroup(a.id, group.id);
    moveWorkspaceToGroup(b.id, group.id);
    reorderWorkspaceInGroup(group.id, a.id, a.id, "before");
    expect(store.groups[group.id].workspaceOrder).toEqual([a.id, b.id]);
  });

  it("no-ops for an unknown group", () => {
    const ws = createWorkspace({ folder: "/p", name: "p" });
    expect(() =>
      reorderWorkspaceInGroup("grp_ghost", ws.id, ws.id, "before"),
    ).not.toThrow();
  });
});

// ── toggleGroupCollapsed ─────────────────────────────────────────────────────

describe("toggleGroupCollapsed", () => {
  it("flips collapsed from false to true", () => {
    const group = makeGroup("G");
    expect(store.groups[group.id].collapsed).toBe(false);
    toggleGroupCollapsed(group.id);
    expect(store.groups[group.id].collapsed).toBe(true);
  });

  it("flips collapsed back to false", () => {
    const group = makeGroup("G");
    toggleGroupCollapsed(group.id);
    toggleGroupCollapsed(group.id);
    expect(store.groups[group.id].collapsed).toBe(false);
  });

  it("no-ops for an unknown id", () => {
    expect(() => toggleGroupCollapsed("grp_ghost")).not.toThrow();
  });
});

// ── deleteWorkspace cleans up group + panel membership ───────────────────────

describe("deleteWorkspace with group membership", () => {
  it("removes the workspace from its group when deleted", () => {
    const group = makeGroup("G");
    const ws = createWorkspace({ folder: "/p", name: "p" });
    moveWorkspaceToGroup(ws.id, group.id);
    deleteWorkspace(ws.id);
    expect(store.groups[group.id].workspaceOrder).not.toContain(ws.id);
    expect(groupIdForWorkspace(ws.id)).toBeUndefined();
  });

  it("removes an ungrouped workspace from panelOrder", () => {
    const ws = createWorkspace({ folder: "/p", name: "p" });
    expect(store.panelOrder).toContain(ws.id);
    deleteWorkspace(ws.id);
    expect(store.panelOrder).not.toContain(ws.id);
    expect(store.workspaces[ws.id]).toBeUndefined();
  });
});

// ── groupIdForWorkspace (derived reverse lookup over the store) ──────────────

describe("groupIdForWorkspace", () => {
  it("returns undefined for an ungrouped workspace", () => {
    const ws = createWorkspace({ folder: "/p", name: "p" });
    expect(groupIdForWorkspace(ws.id)).toBeUndefined();
  });

  it("returns the containing group's id", () => {
    const group = makeGroup("G");
    const ws = createWorkspace({ folder: "/p", name: "p" });
    moveWorkspaceToGroup(ws.id, group.id);
    expect(groupIdForWorkspace(ws.id)).toBe(group.id);
  });

  it("tracks the workspace across a move between groups", () => {
    const g1 = makeGroup("G1");
    const g2 = makeGroup("G2");
    const ws = createWorkspace({ folder: "/p", name: "p" });
    moveWorkspaceToGroup(ws.id, g1.id);
    expect(groupIdForWorkspace(ws.id)).toBe(g1.id);
    moveWorkspaceToGroup(ws.id, g2.id);
    expect(groupIdForWorkspace(ws.id)).toBe(g2.id);
  });
});

// ── workspaceGroupMap (pure reverse-lookup builder) ──────────────────────────

describe("workspaceGroupMap", () => {
  it("returns an empty map when there are no groups", () => {
    expect(workspaceGroupMap({}).size).toBe(0);
  });

  it("maps each member workspace to its group", () => {
    const groups = {
      grp_1: { workspaceOrder: ["ws_a", "ws_b"] },
      grp_2: { workspaceOrder: ["ws_c"] },
    };
    const map = workspaceGroupMap(groups);
    expect(map.get("ws_a")).toBe("grp_1");
    expect(map.get("ws_b")).toBe("grp_1");
    expect(map.get("ws_c")).toBe("grp_2");
    expect(map.has("ws_d")).toBe(false);
  });
});
