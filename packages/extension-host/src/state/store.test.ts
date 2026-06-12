import { describe, it, expect, beforeEach } from "vitest";
import { store, isSidePanelVisible, toggleSidePanelVisibility } from "./store";

describe("side-panel visibility", () => {
  beforeEach(() => {
    store.sidePanelVisibility = {};
  });

  it("defaults to visible when no entry is stored", () => {
    expect(isSidePanelVisible("explorer")).toBe(true);
  });

  it("reports hidden once an explicit false is stored", () => {
    store.sidePanelVisibility.explorer = false;
    expect(isSidePanelVisible("explorer")).toBe(false);
  });

  it("hiding a visible panel stores an explicit false", () => {
    toggleSidePanelVisibility("explorer");
    expect(store.sidePanelVisibility.explorer).toBe(false);
    expect(isSidePanelVisible("explorer")).toBe(false);
  });

  it("showing a hidden panel deletes the key (back to default-visible)", () => {
    store.sidePanelVisibility.explorer = false;
    toggleSidePanelVisibility("explorer");
    expect("explorer" in store.sidePanelVisibility).toBe(false);
    expect(isSidePanelVisible("explorer")).toBe(true);
  });

  it("toggles back and forth without leaking other keys", () => {
    toggleSidePanelVisibility("a");
    toggleSidePanelVisibility("a");
    expect(store.sidePanelVisibility).toEqual({});
  });
});
