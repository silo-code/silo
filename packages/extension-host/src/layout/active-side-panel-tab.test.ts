import { describe, expect, it } from "vitest";
import { resolveActiveSidePanelId } from "./active-side-panel-tab";

describe("resolveActiveSidePanelId", () => {
  const panels = ["explorer", "search", "git"];

  it("returns null when the pane is empty", () => {
    expect(resolveActiveSidePanelId([], "explorer", "explorer")).toBeNull();
  });

  it("prefers the saved tab when there is no local selection yet", () => {
    expect(resolveActiveSidePanelId(panels, null, "git")).toBe("git");
  });

  it("falls back to the first panel when nothing is saved", () => {
    expect(resolveActiveSidePanelId(panels, null, undefined)).toBe("explorer");
  });

  it("falls back to the first panel when the saved id is no longer in the pane", () => {
    expect(resolveActiveSidePanelId(panels, null, "gone")).toBe("explorer");
  });

  it("replaces a stale local selection with the saved tab", () => {
    expect(resolveActiveSidePanelId(panels, "gone", "search")).toBe("search");
  });

  it("follows a workspace-switch change to the saved tab while local is still valid", () => {
    // Local still shows the previous workspace's tab; store already holds the
    // incoming workspace's saved tab — this is the ADR 0035 per-workspace path.
    expect(resolveActiveSidePanelId(panels, "explorer", "git")).toBe("git");
  });

  it("keeps the local selection when it already matches the saved tab", () => {
    expect(resolveActiveSidePanelId(panels, "search", "search")).toBe("search");
  });

  it("keeps a valid local selection when nothing is saved", () => {
    expect(resolveActiveSidePanelId(panels, "git", undefined)).toBe("git");
  });

  it("keeps a valid local selection when the saved id is unknown", () => {
    expect(resolveActiveSidePanelId(panels, "git", "gone")).toBe("git");
  });
});
