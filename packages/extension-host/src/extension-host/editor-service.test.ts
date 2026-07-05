import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Editor } from "@silo-code/sdk";
import type { WorkspaceInternal } from "../state/types";
import { store } from "../state/store";
import { editorRegistry } from "./editor-registry";
import { setContextKey } from "./context-keys";
import { getEditorService } from "./editor-service";

// Drives the host EditorService against a real (in-memory) store + editor
// registry — covers opening with a chosen view and the in-place view switch.

const svc = getEditorService();
const disposers: Array<() => void> = [];

function register(partial: Partial<Editor> & Pick<Editor, "id" | "match">) {
  const handle = editorRegistry.register({ component: () => null, ...partial });
  disposers.push(handle.dispose);
}

function makeWorkspace(id: string): WorkspaceInternal {
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
  setContextKey("activeEditorId", null);
  setContextKey("activeEditorViewId", null);
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

describe("EditorService.getState / subscribe", () => {
  it("returns null active when no context key is set", () => {
    expect(svc.getState().active).toBeNull();
  });

  it("returns active info when context keys are set", () => {
    svc.open("/ws/w/readme.md");
    const editorId = editors()[0].id;
    setContextKey("activeEditorId", editorId);
    setContextKey("activeEditorViewId", "text");

    const state = svc.getState();
    expect(state.active).toMatchObject({
      editorId,
      filePath: "/ws/w/readme.md",
      viewId: "text",
      mode: "text",
    });
  });

  it("returns active with null filePath for untitled buffer", () => {
    svc.openUntitled();
    const editorId = editors()[0].id;
    setContextKey("activeEditorId", editorId);
    setContextKey("activeEditorViewId", "text");

    expect(svc.getState().active?.filePath).toBeNull();
  });

  it("returns active with mode=diff for a diff record", () => {
    editors().push({
      id: "ed_diff",
      filePath: "/ws/w/readme.md",
      title: "readme.md",
      mode: "diff",
      providerId: "x",
    });
    setContextKey("activeEditorId", "ed_diff");
    setContextKey("activeEditorViewId", null);

    expect(svc.getState().active?.mode).toBe("diff");
  });

  it("is referentially stable when nothing changes", () => {
    const s1 = svc.getState();
    const s2 = svc.getState();
    expect(s1).toBe(s2);
  });

  it("returns a new object after active editor changes", () => {
    svc.open("/ws/w/readme.md");
    const editorId = editors()[0].id;
    const s1 = svc.getState();
    setContextKey("activeEditorId", editorId);
    setContextKey("activeEditorViewId", "text");
    const s2 = svc.getState();
    expect(s1).not.toBe(s2);
    expect(s2.active?.editorId).toBe(editorId);
  });

  it("notifies subscribers when active editor changes", () => {
    svc.open("/ws/w/readme.md");
    const editorId = editors()[0].id;
    const listener = vi.fn();
    const sub = svc.subscribe(listener);

    setContextKey("activeEditorId", editorId);
    setContextKey("activeEditorViewId", "text");

    expect(listener).toHaveBeenCalled();
    sub.dispose();
  });

  it("does not notify after dispose", () => {
    svc.open("/ws/w/readme.md");
    const editorId = editors()[0].id;
    const listener = vi.fn();
    const sub = svc.subscribe(listener);
    sub.dispose();

    setContextKey("activeEditorId", editorId);
    expect(listener).not.toHaveBeenCalled();
  });

  it("delivers null active when active panel moves away from editor", () => {
    svc.open("/ws/w/readme.md");
    const editorId = editors()[0].id;
    setContextKey("activeEditorId", editorId);
    setContextKey("activeEditorViewId", "text");

    const states: Array<ReturnType<typeof svc.getState>> = [];
    const sub = svc.subscribe((s) => states.push(s));

    setContextKey("activeEditorId", null);
    setContextKey("activeEditorViewId", null);

    expect(states.at(-1)?.active).toBeNull();
    sub.dispose();
  });

  it("returns null active when editorId is set but not found in current workspace (stale context key)", () => {
    // Simulate workspace switch: store.activeWorkspaceId has moved to a new
    // workspace whose editors don't contain the stale editorId from context keys.
    setContextKey("activeEditorId", "ed_from_old_workspace");
    setContextKey("activeEditorViewId", "text");
    // store.workspaces.w has no editor with id "ed_from_old_workspace"
    expect(svc.getState().active).toBeNull();
  });

  it("does not notify subscribers when unrelated store changes leave editor state unchanged", () => {
    svc.open("/ws/w/readme.md");
    const editorId = editors()[0].id;
    setContextKey("activeEditorId", editorId);
    setContextKey("activeEditorViewId", "text");
    const listener = vi.fn();
    const sub = svc.subscribe(listener);
    listener.mockClear();

    // Mutate something unrelated on the store — listeners should not fire
    store.activeWorkspaceId = store.activeWorkspaceId; // no-op to avoid side effects
    // Verify the guard: call notifyEditorListeners indirectly via a known no-op context change
    // (setContextKey short-circuits when value is unchanged)
    setContextKey("activeEditorViewId", "text"); // same value — no listener fires

    expect(listener).not.toHaveBeenCalled();
    sub.dispose();
  });
});
