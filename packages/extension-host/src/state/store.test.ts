import { describe, it, expect, beforeEach } from "vitest";
import {
  store,
  isSidePanelVisible,
  toggleSidePanelVisibility,
  collapseStateByMode,
  swapCollapseMode,
} from "./store";

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

describe("the two side-column layout modes", () => {
  beforeEach(() => {
    store.leftPanelCollapsed = false;
    store.rightPanelCollapsed = false;
    store.smallScreenActive = false;
    store.inactiveModeCollapsed = null;
  });

  it("sorts the live pair into the normal slot off a small screen", () => {
    store.leftPanelCollapsed = true;
    expect(collapseStateByMode()).toEqual({
      normal: { left: true, right: false },
      smallScreen: null,
    });
  });

  it("sorts the live pair into the small-screen slot while narrow", () => {
    store.smallScreenActive = true;
    store.inactiveModeCollapsed = { left: true, right: false };
    store.rightPanelCollapsed = true;
    expect(collapseStateByMode()).toEqual({
      normal: { left: true, right: false },
      smallScreen: { left: false, right: true },
    });
  });

  it("swaps the live and parked modes, so a round trip is a no-op", () => {
    store.leftPanelCollapsed = true; // the normal-width layout
    store.inactiveModeCollapsed = { left: false, right: true };

    swapCollapseMode({ left: true, right: true });
    expect(store.leftPanelCollapsed).toBe(false);
    expect(store.rightPanelCollapsed).toBe(true);
    expect(store.inactiveModeCollapsed).toEqual({ left: true, right: false });

    swapCollapseMode({ left: false, right: false });
    expect(store.leftPanelCollapsed).toBe(true);
    expect(store.rightPanelCollapsed).toBe(false);
  });

  it("falls back to the given layout when the mode being entered has none", () => {
    swapCollapseMode({ left: true, right: true });
    expect(store.leftPanelCollapsed).toBe(true);
    expect(store.rightPanelCollapsed).toBe(true);
    expect(store.inactiveModeCollapsed).toEqual({ left: false, right: false });
  });
});
