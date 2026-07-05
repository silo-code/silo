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
  closeGroup,
  restoreGroup,
  activateWorkspace,
  reopenWorkspace,
  closeWorkspace,
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

  it("stores an optional color when one is given", () => {
    const group = createGroup("Colored", "#e06c75");
    expect(store.groups[group.id].color).toBe("#e06c75");
  });

  it("leaves color undefined when none is given", () => {
    const group = createGroup("Plain");
    expect(store.groups[group.id].color).toBeUndefined();
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

// ── closeGroup ───────────────────────────────────────────────────────────────

describe("closeGroup", () => {
  it("sets closedAt on the group and every open member", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    moveWorkspaceToGroup(a.id, group.id);
    moveWorkspaceToGroup(b.id, group.id);
    closeGroup(group.id);
    expect(store.groups[group.id].closedAt).not.toBeNull();
    expect(store.workspaces[a.id].closedAt).not.toBeNull();
    expect(store.workspaces[b.id].closedAt).not.toBeNull();
  });

  it("records only members that were open at close time", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    moveWorkspaceToGroup(a.id, group.id);
    moveWorkspaceToGroup(b.id, group.id);
    closeWorkspace(a.id); // pre-closed before the group-close
    closeGroup(group.id);
    expect(store.groups[group.id].closedMemberIds).toEqual([b.id]);
  });

  it("records an empty list for an empty group", () => {
    const group = makeGroup("G");
    closeGroup(group.id);
    expect(store.groups[group.id].closedAt).not.toBeNull();
    expect(store.groups[group.id].closedMemberIds).toEqual([]);
  });

  it("records an empty list when all members are already closed", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    moveWorkspaceToGroup(a.id, group.id);
    closeWorkspace(a.id);
    closeGroup(group.id);
    expect(store.groups[group.id].closedMemberIds).toEqual([]);
  });

  it("falls back the active workspace to the next open non-member", () => {
    const other = createWorkspace({ folder: "/other", name: "other" });
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    moveWorkspaceToGroup(a.id, group.id);
    moveWorkspaceToGroup(b.id, group.id);
    activateWorkspace(b.id);
    closeGroup(group.id);
    expect(store.activeWorkspaceId).toBe(other.id);
  });

  it("falls back the active workspace to null when nothing else is open", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    moveWorkspaceToGroup(a.id, group.id);
    moveWorkspaceToGroup(b.id, group.id);
    activateWorkspace(b.id);
    closeGroup(group.id);
    expect(store.activeWorkspaceId).toBeNull();
  });

  it("does not move the group's slot in panelOrder", () => {
    const before = createWorkspace({ folder: "/before", name: "before" });
    const group = makeGroup("G");
    const after = createWorkspace({ folder: "/after", name: "after" });
    const order = [...store.panelOrder];
    closeGroup(group.id);
    expect(store.panelOrder).toEqual(order);
    expect(store.panelOrder).toEqual([before.id, group.id, after.id]);
  });

  it("no-ops for an unknown id", () => {
    expect(() => closeGroup("grp_ghost")).not.toThrow();
  });

  it("no-ops for an already-closed group", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    moveWorkspaceToGroup(a.id, group.id);
    closeGroup(group.id);
    const closedAt = store.groups[group.id].closedAt;
    closeGroup(group.id);
    expect(store.groups[group.id].closedAt).toBe(closedAt);
    expect(store.groups[group.id].closedMemberIds).toEqual([a.id]);
  });
});

// ── restoreGroup ─────────────────────────────────────────────────────────────

describe("restoreGroup", () => {
  it("reopens exactly the members recorded at close time", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    moveWorkspaceToGroup(a.id, group.id);
    moveWorkspaceToGroup(b.id, group.id);
    closeWorkspace(a.id); // pre-closed before the group-close
    closeGroup(group.id);
    restoreGroup(group.id);
    expect(store.groups[group.id].closedAt).toBeNull();
    expect(store.groups[group.id].closedMemberIds).toBeUndefined();
    expect(store.workspaces[b.id].closedAt).toBeNull();
    // The pre-closed member is left closed — restore only reverses the group-close.
    expect(store.workspaces[a.id].closedAt).not.toBeNull();
  });

  it("activates the first reopened member", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    moveWorkspaceToGroup(a.id, group.id);
    moveWorkspaceToGroup(b.id, group.id);
    closeGroup(group.id);
    restoreGroup(group.id);
    expect(store.activeWorkspaceId).toBe(a.id);
  });

  it("skips a recorded member that was deleted while the group was closed", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    moveWorkspaceToGroup(a.id, group.id);
    moveWorkspaceToGroup(b.id, group.id);
    closeGroup(group.id);
    deleteWorkspace(a.id);
    expect(() => restoreGroup(group.id)).not.toThrow();
    expect(store.workspaces[b.id].closedAt).toBeNull();
    expect(store.activeWorkspaceId).toBe(b.id);
  });

  it("skips a recorded member that was moved to another group while closed", () => {
    const group = makeGroup("G");
    const other = makeGroup("Other");
    const a = createWorkspace({ folder: "/a", name: "a" });
    moveWorkspaceToGroup(a.id, group.id);
    closeGroup(group.id);
    moveWorkspaceToGroup(a.id, other.id); // allowed: destination group is open
    restoreGroup(group.id);
    expect(store.workspaces[a.id].closedAt).not.toBeNull();
    expect(groupIdForWorkspace(a.id)).toBe(other.id);
  });

  it("leaves activeWorkspaceId unchanged when nothing is reopened", () => {
    const group = makeGroup("G"); // empty group
    const active = createWorkspace({ folder: "/active", name: "active" });
    closeGroup(group.id);
    restoreGroup(group.id);
    expect(store.groups[group.id].closedAt).toBeNull();
    expect(store.activeWorkspaceId).toBe(active.id);
  });

  it("no-ops for an unknown id", () => {
    expect(() => restoreGroup("grp_ghost")).not.toThrow();
  });

  it("no-ops for a group that is not closed", () => {
    const group = makeGroup("G");
    expect(() => restoreGroup(group.id)).not.toThrow();
    expect(store.groups[group.id].closedAt).toBeUndefined();
  });
});

// ── activateWorkspace / reopenWorkspace reopen a closed group's shell ────────

describe("activateWorkspace / reopenWorkspace on a member of a closed group", () => {
  it("activateWorkspace reopens the group shell but leaves siblings closed", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    moveWorkspaceToGroup(a.id, group.id);
    moveWorkspaceToGroup(b.id, group.id);
    closeGroup(group.id);
    activateWorkspace(a.id);
    expect(store.groups[group.id].closedAt).toBeNull();
    expect(store.groups[group.id].closedMemberIds).toBeUndefined();
    expect(store.workspaces[a.id].closedAt).toBeNull();
    expect(store.workspaces[b.id].closedAt).not.toBeNull();
  });

  it("reopenWorkspace reopens the group shell but leaves siblings closed", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    moveWorkspaceToGroup(a.id, group.id);
    moveWorkspaceToGroup(b.id, group.id);
    closeGroup(group.id);
    reopenWorkspace(b.id);
    expect(store.groups[group.id].closedAt).toBeNull();
    expect(store.workspaces[b.id].closedAt).toBeNull();
    expect(store.workspaces[a.id].closedAt).not.toBeNull();
  });
});

// ── moveWorkspaceToGroup guard against closed groups ─────────────────────────

describe("moveWorkspaceToGroup into a closed group", () => {
  it("no-ops, leaving the workspace where it was", () => {
    const group = makeGroup("G");
    closeGroup(group.id);
    const ws = createWorkspace({ folder: "/p", name: "p" });
    moveWorkspaceToGroup(ws.id, group.id);
    expect(groupIdForWorkspace(ws.id)).toBeUndefined();
    expect(store.panelOrder).toContain(ws.id);
    expect(store.groups[group.id].workspaceOrder).not.toContain(ws.id);
  });
});

// ── deleteGroup on a closed group ─────────────────────────────────────────────

describe("deleteGroup on a closed group", () => {
  it("splices members into panelOrder at the group's slot and leaves them closed", () => {
    const group = makeGroup("G");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    moveWorkspaceToGroup(a.id, group.id);
    moveWorkspaceToGroup(b.id, group.id);
    closeGroup(group.id);
    deleteGroup(group.id);
    expect(store.groups[group.id]).toBeUndefined();
    expect(store.panelOrder).toEqual([a.id, b.id]);
    expect(store.workspaces[a.id].closedAt).not.toBeNull();
    expect(store.workspaces[b.id].closedAt).not.toBeNull();
  });
});
