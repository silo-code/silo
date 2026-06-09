import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Editor, Workspace } from "@silo-code/sdk";
import { store } from "../state/store";
import { editorRegistry } from "./editor-registry";
import { getEditorService } from "./editor-service";

// Drives the host EditorService against a real (in-memory) store + editor
// registry — covers opening with a chosen view and the in-place view switch.

const svc = getEditorService();
const disposers: Array<() => void> = [];

function register(partial: Partial<Editor> & Pick<Editor, "id" | "match">) {
  const handle = editorRegistry.register({ component: () => null, ...partial });
  disposers.push(handle.dispose);
}

function makeWorkspace(id: string): Workspace {
  return {
    id,
    name: id,
    folder: `/ws/${id}`,
    createdAt: "",
    lastOpenedAt: "",
    terminals: [],
    editors: [],
    dockLayout: null,
    previewEditorId: null,
  };
}

beforeEach(() => {
  store.workspaces = { w: makeWorkspace("w") };
  store.workspaceOrder = ["w"];
  store.activeWorkspaceId = "w";
  register({ id: "text", label: "Text", match: () => true, priority: 0 });
  register({
    id: "preview",
    label: "Preview",
    match: (p) => !!p?.endsWith(".md"),
    priority: 0,
    capabilities: { readonly: true, handlesUntitled: false },
  });
});

afterEach(() => {
  while (disposers.length) disposers.pop()!();
  store.workspaces = {};
  store.workspaceOrder = [];
  store.activeWorkspaceId = null;
});

const editors = () => store.workspaces.w.editors;

describe("EditorService.open with viewType", () => {
  it("opens a plain tab with no viewType when none is given", () => {
    svc.open("/ws/w/readme.md");
    expect(editors()).toHaveLength(1);
    expect(editors()[0].filePath).toBe("/ws/w/readme.md");
    expect(editors()[0].viewType).toBeUndefined();
  });

  it("sets viewType on a new tab when requested", () => {
    svc.open("/ws/w/readme.md", { viewType: "preview" });
    expect(editors()).toHaveLength(1);
    expect(editors()[0].viewType).toBe("preview");
  });

  it("reuses the existing tab and switches its view in place (no duplicate)", () => {
    svc.open("/ws/w/readme.md");
    svc.open("/ws/w/readme.md", { viewType: "preview" });
    expect(editors()).toHaveLength(1);
    expect(editors()[0].viewType).toBe("preview");
  });
});

describe("EditorService.setViewType", () => {
  it("switches an open tab to a matching view", () => {
    svc.open("/ws/w/readme.md");
    const id = editors()[0].id;
    svc.setViewType(id, "preview");
    expect(editors()[0].viewType).toBe("preview");
  });

  it("is a no-op for an unknown viewType", () => {
    svc.open("/ws/w/readme.md");
    const id = editors()[0].id;
    svc.setViewType(id, "does-not-exist");
    expect(editors()[0].viewType).toBeUndefined();
  });

  it("is a no-op when the target editor doesn't match the file", () => {
    svc.open("/ws/w/main.ts");
    const id = editors()[0].id;
    // "preview" only matches .md — refuse to pin it to a .ts tab.
    svc.setViewType(id, "preview");
    expect(editors()[0].viewType).toBeUndefined();
  });

  it("ignores diff records", () => {
    editors().push({
      id: "ed_diff",
      filePath: "/ws/w/readme.md",
      title: "readme.md",
      mode: "diff",
      providerId: "x",
    });
    svc.setViewType("ed_diff", "preview");
    expect(editors().find((e) => e.id === "ed_diff")?.viewType).toBeUndefined();
  });

  it("is a no-op for an unknown editor id", () => {
    expect(() => svc.setViewType("nope", "preview")).not.toThrow();
  });
});
