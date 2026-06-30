import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./editor-backups", () => ({
  clearEditorBackup: vi.fn(() => Promise.resolve()),
}));

// Tauri dialog is not available in tests
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({ basename: vi.fn() }));

import { store } from "./store";
import type { WorkspacePanelSection } from "./types";
import {
  createSection,
  renameSection,
  setSectionColor,
  deleteSection,
  reorderSections,
  moveWorkspaceToSection,
  removeWorkspaceFromSection,
  reorderWorkspaceInSection,
  toggleSectionCollapsed,
  createWorkspace,
  deleteWorkspace,
} from "./workspaces";

function makeSection(name: string): WorkspacePanelSection {
  return createSection(name);
}

beforeEach(() => {
  store.workspaces = {};
  store.workspaceOrder = [];
  store.activeWorkspaceId = null;
  store.sections = {};
  store.sectionOrder = [];
  store.workspaceSections = {};
});

// ── createSection ────────────────────────────────────────────────────────────

describe("createSection", () => {
  it("adds the section to store.sections keyed by its id", () => {
    const sec = createSection("Work");
    expect(store.sections[sec.id]).toBeDefined();
    expect(store.sections[sec.id].name).toBe("Work");
    expect(store.sections[sec.id].collapsed).toBe(false);
    expect(store.sections[sec.id].workspaceOrder).toEqual([]);
  });

  it("appends the section id to sectionOrder", () => {
    const a = createSection("A");
    const b = createSection("B");
    expect(store.sectionOrder).toEqual([a.id, b.id]);
  });

  it("returns the new section object", () => {
    const sec = createSection("Test");
    expect(sec.id).toMatch(/^sec_/);
    expect(sec.name).toBe("Test");
  });
});

// ── setSectionColor ───────────────────────────────────────────────────────────

describe("setSectionColor", () => {
  it("sets the color on a section", () => {
    const sec = makeSection("S");
    setSectionColor(sec.id, "#e06c75");
    expect(store.sections[sec.id].color).toBe("#e06c75");
  });

  it("clears the color when passed undefined", () => {
    const sec = makeSection("S");
    setSectionColor(sec.id, "#e06c75");
    setSectionColor(sec.id, undefined);
    expect(store.sections[sec.id].color).toBeUndefined();
  });

  it("no-ops for an unknown id", () => {
    expect(() => setSectionColor("sec_unknown", "#e06c75")).not.toThrow();
  });
});

// ── renameSection ────────────────────────────────────────────────────────────

describe("renameSection", () => {
  it("updates the section name", () => {
    const sec = makeSection("Old");
    renameSection(sec.id, "New");
    expect(store.sections[sec.id].name).toBe("New");
  });

  it("no-ops for an unknown id", () => {
    expect(() => renameSection("sec_unknown", "x")).not.toThrow();
  });
});

// ── deleteSection ────────────────────────────────────────────────────────────

describe("deleteSection", () => {
  it("removes the section from sections and sectionOrder", () => {
    const a = makeSection("A");
    const b = makeSection("B");
    deleteSection(a.id);
    expect(store.sections[a.id]).toBeUndefined();
    expect(store.sectionOrder).toEqual([b.id]);
  });

  it("clears workspaceSections entries for all member workspaces", () => {
    const sec = makeSection("S");
    const ws = createWorkspace({ folder: "/p", name: "p" });
    moveWorkspaceToSection(ws.id, sec.id);
    expect(store.workspaceSections[ws.id]).toBe(sec.id);
    deleteSection(sec.id);
    expect(store.workspaceSections[ws.id]).toBeUndefined();
  });

  it("no-ops for an unknown id", () => {
    expect(() => deleteSection("sec_unknown")).not.toThrow();
  });
});

// ── reorderSections ──────────────────────────────────────────────────────────

describe("reorderSections", () => {
  it("moves a section before another", () => {
    const a = makeSection("A");
    const b = makeSection("B");
    const c = makeSection("C");
    reorderSections(c.id, a.id, "before");
    expect(store.sectionOrder).toEqual([c.id, a.id, b.id]);
  });

  it("moves a section after another", () => {
    const a = makeSection("A");
    const b = makeSection("B");
    const c = makeSection("C");
    reorderSections(a.id, c.id, "after");
    expect(store.sectionOrder).toEqual([b.id, c.id, a.id]);
  });

  it("no-ops when fromId === toId", () => {
    const a = makeSection("A");
    const b = makeSection("B");
    reorderSections(a.id, a.id, "before");
    expect(store.sectionOrder).toEqual([a.id, b.id]);
  });

  it("no-ops when fromId is not in sectionOrder", () => {
    const a = makeSection("A");
    const b = makeSection("B");
    reorderSections("sec_ghost", b.id, "before");
    expect(store.sectionOrder).toEqual([a.id, b.id]);
  });
});

// ── moveWorkspaceToSection ───────────────────────────────────────────────────

describe("moveWorkspaceToSection", () => {
  it("sets the reverse-lookup and adds to section workspaceOrder", () => {
    const sec = makeSection("S");
    const ws = createWorkspace({ folder: "/p", name: "p" });
    moveWorkspaceToSection(ws.id, sec.id);
    expect(store.workspaceSections[ws.id]).toBe(sec.id);
    expect(store.sections[sec.id].workspaceOrder).toContain(ws.id);
  });

  it("moves a workspace from one section to another", () => {
    const s1 = makeSection("S1");
    const s2 = makeSection("S2");
    const ws = createWorkspace({ folder: "/p", name: "p" });
    moveWorkspaceToSection(ws.id, s1.id);
    moveWorkspaceToSection(ws.id, s2.id);
    expect(store.sections[s1.id].workspaceOrder).not.toContain(ws.id);
    expect(store.sections[s2.id].workspaceOrder).toContain(ws.id);
    expect(store.workspaceSections[ws.id]).toBe(s2.id);
  });

  it("does not duplicate the workspace in the section order", () => {
    const sec = makeSection("S");
    const ws = createWorkspace({ folder: "/p", name: "p" });
    moveWorkspaceToSection(ws.id, sec.id);
    moveWorkspaceToSection(ws.id, sec.id);
    expect(
      store.sections[sec.id].workspaceOrder.filter((id) => id === ws.id),
    ).toHaveLength(1);
  });

  it("no-ops for an unknown section id", () => {
    const ws = createWorkspace({ folder: "/p", name: "p" });
    expect(() => moveWorkspaceToSection(ws.id, "sec_ghost")).not.toThrow();
    expect(store.workspaceSections[ws.id]).toBeUndefined();
  });
});

// ── removeWorkspaceFromSection ───────────────────────────────────────────────

describe("removeWorkspaceFromSection", () => {
  it("removes the workspace from the section and clears the reverse lookup", () => {
    const sec = makeSection("S");
    const ws = createWorkspace({ folder: "/p", name: "p" });
    moveWorkspaceToSection(ws.id, sec.id);
    removeWorkspaceFromSection(ws.id);
    expect(store.workspaceSections[ws.id]).toBeUndefined();
    expect(store.sections[sec.id].workspaceOrder).not.toContain(ws.id);
  });

  it("no-ops when the workspace is not in any section", () => {
    const ws = createWorkspace({ folder: "/p", name: "p" });
    expect(() => removeWorkspaceFromSection(ws.id)).not.toThrow();
    expect(store.workspaceSections[ws.id]).toBeUndefined();
  });
});

// ── reorderWorkspaceInSection ────────────────────────────────────────────────

describe("reorderWorkspaceInSection", () => {
  it("moves a workspace before another within the section", () => {
    const sec = makeSection("S");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    const c = createWorkspace({ folder: "/c", name: "c" });
    moveWorkspaceToSection(a.id, sec.id);
    moveWorkspaceToSection(b.id, sec.id);
    moveWorkspaceToSection(c.id, sec.id);
    reorderWorkspaceInSection(sec.id, c.id, a.id, "before");
    expect(store.sections[sec.id].workspaceOrder).toEqual([c.id, a.id, b.id]);
  });

  it("moves a workspace after another within the section", () => {
    const sec = makeSection("S");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    const c = createWorkspace({ folder: "/c", name: "c" });
    moveWorkspaceToSection(a.id, sec.id);
    moveWorkspaceToSection(b.id, sec.id);
    moveWorkspaceToSection(c.id, sec.id);
    reorderWorkspaceInSection(sec.id, a.id, c.id, "after");
    expect(store.sections[sec.id].workspaceOrder).toEqual([b.id, c.id, a.id]);
  });

  it("no-ops when fromId === toId", () => {
    const sec = makeSection("S");
    const a = createWorkspace({ folder: "/a", name: "a" });
    const b = createWorkspace({ folder: "/b", name: "b" });
    moveWorkspaceToSection(a.id, sec.id);
    moveWorkspaceToSection(b.id, sec.id);
    reorderWorkspaceInSection(sec.id, a.id, a.id, "before");
    expect(store.sections[sec.id].workspaceOrder).toEqual([a.id, b.id]);
  });

  it("no-ops for an unknown section", () => {
    const ws = createWorkspace({ folder: "/p", name: "p" });
    expect(() =>
      reorderWorkspaceInSection("sec_ghost", ws.id, ws.id, "before"),
    ).not.toThrow();
  });
});

// ── toggleSectionCollapsed ───────────────────────────────────────────────────

describe("toggleSectionCollapsed", () => {
  it("flips collapsed from false to true", () => {
    const sec = makeSection("S");
    expect(store.sections[sec.id].collapsed).toBe(false);
    toggleSectionCollapsed(sec.id);
    expect(store.sections[sec.id].collapsed).toBe(true);
  });

  it("flips collapsed back to false", () => {
    const sec = makeSection("S");
    toggleSectionCollapsed(sec.id);
    toggleSectionCollapsed(sec.id);
    expect(store.sections[sec.id].collapsed).toBe(false);
  });

  it("no-ops for an unknown id", () => {
    expect(() => toggleSectionCollapsed("sec_ghost")).not.toThrow();
  });
});

// ── deleteWorkspace cleans up section membership ─────────────────────────────

describe("deleteWorkspace with section membership", () => {
  it("removes the workspace from its section when deleted", () => {
    const sec = makeSection("S");
    const ws = createWorkspace({ folder: "/p", name: "p" });
    moveWorkspaceToSection(ws.id, sec.id);
    deleteWorkspace(ws.id);
    expect(store.sections[sec.id].workspaceOrder).not.toContain(ws.id);
    expect(store.workspaceSections[ws.id]).toBeUndefined();
  });

  it("works normally for workspaces not in any section", () => {
    const ws = createWorkspace({ folder: "/p", name: "p" });
    expect(() => deleteWorkspace(ws.id)).not.toThrow();
    expect(store.workspaces[ws.id]).toBeUndefined();
  });
});
