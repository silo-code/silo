import { describe, it, expect } from "vitest";
import type { EditorViewInfo } from "@silo-code/sdk";
import { viewSwitcherModel } from "./view-switcher-model";

const TEXT: EditorViewInfo = { id: "text", label: "Text", isDefault: true };
const PREVIEW: EditorViewInfo = {
  id: "preview",
  label: "Preview",
  isDefault: false,
};
const THIRD: EditorViewInfo = { id: "third", label: "Third", isDefault: false };

describe("viewSwitcherModel", () => {
  it("hides for diffs", () => {
    expect(
      viewSwitcherModel({
        views: [TEXT, PREVIEW],
        viewType: null,
        filePath: "/a/x.md",
        isDiff: true,
      }),
    ).toBeNull();
  });

  it("hides for untitled buffers (no path)", () => {
    expect(
      viewSwitcherModel({
        views: [TEXT, PREVIEW],
        viewType: null,
        filePath: null,
        isDiff: false,
      }),
    ).toBeNull();
  });

  it("hides when only one view matches", () => {
    expect(
      viewSwitcherModel({
        views: [TEXT],
        viewType: null,
        filePath: "/a/main.ts",
        isDiff: false,
      }),
    ).toBeNull();
  });

  it("uses a segmented toggle for exactly two views", () => {
    const m = viewSwitcherModel({
      views: [TEXT, PREVIEW],
      viewType: null,
      filePath: "/a/x.md",
      isDiff: false,
    });
    expect(m?.mode).toBe("segmented");
  });

  it("uses a dropdown for three or more views", () => {
    const m = viewSwitcherModel({
      views: [TEXT, PREVIEW, THIRD],
      viewType: null,
      filePath: "/a/x.md",
      isDiff: false,
    });
    expect(m?.mode).toBe("dropdown");
  });

  it("defaults the current view to the flagged default", () => {
    const m = viewSwitcherModel({
      views: [TEXT, PREVIEW],
      viewType: null,
      filePath: "/a/x.md",
      isDiff: false,
    });
    expect(m?.currentId).toBe("text");
  });

  it("honors an explicit viewType as the current view", () => {
    const m = viewSwitcherModel({
      views: [TEXT, PREVIEW],
      viewType: "preview",
      filePath: "/a/x.md",
      isDiff: false,
    });
    expect(m?.currentId).toBe("preview");
  });
});
