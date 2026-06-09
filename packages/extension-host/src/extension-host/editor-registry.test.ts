import { describe, it, expect, afterEach } from "vitest";
import type { Editor } from "@silo-code/sdk";
import {
  editorRegistry,
  resolveEditor,
  resolveEditorForRecord,
} from "./editor-registry";
import { getEditorService } from "./editor-service";

// editorRegistry is a module singleton; unit tests start with it empty (no
// builtins activate here). Register editors per test and dispose afterward.
const disposers: Array<() => void> = [];

function register(partial: Partial<Editor> & Pick<Editor, "id" | "match">) {
  const editor: Editor = {
    component: () => null,
    ...partial,
  };
  const handle = editorRegistry.register(editor);
  disposers.push(handle.dispose);
  return editor;
}

afterEach(() => {
  while (disposers.length) disposers.pop()!();
});

describe("resolveEditor", () => {
  it("picks the highest-priority matching editor", () => {
    register({ id: "text", match: () => true, priority: 0 });
    register({ id: "md", match: (p) => !!p?.endsWith(".md"), priority: 10 });
    expect(resolveEditor("readme.md").id).toBe("md");
    expect(resolveEditor("main.ts").id).toBe("text");
  });

  it("breaks ties in favor of the first-registered editor", () => {
    register({ id: "text", match: () => true, priority: 0 });
    register({
      id: "preview",
      match: (p) => !!p?.endsWith(".md"),
      priority: 0,
    });
    // Both match a .md at priority 0 → the one registered first (text) wins.
    expect(resolveEditor("notes.md").id).toBe("text");
  });

  it("ignores editors that can't handle untitled buffers", () => {
    register({
      id: "text",
      match: () => true,
      priority: 0,
      capabilities: { handlesUntitled: true },
    });
    register({
      id: "preview",
      match: () => true,
      priority: 10,
      capabilities: { handlesUntitled: false },
    });
    // Higher-priority preview opts out of untitled → text is chosen.
    expect(resolveEditor("Untitled", { untitled: true }).id).toBe("text");
  });
});

describe("resolveEditorForRecord", () => {
  it("honors an explicit viewType when it's registered and matches", () => {
    register({ id: "text", match: () => true, priority: 0 });
    register({
      id: "preview",
      match: (p) => !!p?.endsWith(".md"),
      priority: 0,
    });
    const rec = {
      filePath: "/a/readme.md",
      title: "readme.md",
      viewType: "preview",
    };
    expect(resolveEditorForRecord(rec).id).toBe("preview");
  });

  it("falls back to priority when the viewType is unknown", () => {
    register({ id: "text", match: () => true, priority: 0 });
    const rec = {
      filePath: "/a/readme.md",
      title: "readme.md",
      viewType: "gone",
    };
    expect(resolveEditorForRecord(rec).id).toBe("text");
  });

  it("falls back to priority when the viewType no longer matches the file", () => {
    register({ id: "text", match: () => true, priority: 0 });
    register({
      id: "preview",
      match: (p) => !!p?.endsWith(".md"),
      priority: 0,
    });
    // The record points at preview but the file is a .ts — preview won't match.
    const rec = {
      filePath: "/a/main.ts",
      title: "main.ts",
      viewType: "preview",
    };
    expect(resolveEditorForRecord(rec).id).toBe("text");
  });

  it("ignores a viewType that can't load an untitled buffer", () => {
    register({
      id: "text",
      match: () => true,
      priority: 0,
      capabilities: { handlesUntitled: true },
    });
    register({
      id: "preview",
      match: () => true,
      priority: 0,
      capabilities: { handlesUntitled: false },
    });
    const rec = { filePath: null, title: "Untitled.md", viewType: "preview" };
    expect(resolveEditorForRecord(rec).id).toBe("text");
  });
});

describe("EditorService.editorsFor", () => {
  it("lists matching views highest-priority first, flagging the default", () => {
    register({ id: "text", label: "Text", match: () => true, priority: 0 });
    register({
      id: "preview",
      label: "Preview",
      match: (p) => !!p?.endsWith(".md"),
      priority: 0,
    });
    const views = getEditorService().editorsFor("/a/readme.md");
    expect(views.map((v) => v.id)).toEqual(["text", "preview"]);
    expect(views.find((v) => v.id === "text")?.isDefault).toBe(true);
    expect(views.find((v) => v.id === "preview")?.isDefault).toBe(false);
  });

  it("returns a single view for files only the text editor matches", () => {
    register({ id: "text", label: "Text", match: () => true, priority: 0 });
    register({
      id: "preview",
      label: "Preview",
      match: (p) => !!p?.endsWith(".md"),
      priority: 0,
    });
    const views = getEditorService().editorsFor("/a/main.ts");
    expect(views.map((v) => v.id)).toEqual(["text"]);
  });

  it("falls back to the id when an editor has no label", () => {
    register({ id: "text", match: () => true, priority: 0 });
    const [view] = getEditorService().editorsFor("/a/main.ts");
    expect(view.label).toBe("text");
  });
});
