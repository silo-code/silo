import { describe, it, expect } from "vitest";
import {
  SIDE_PANEL_SLOTS,
  isSidePanelSlot,
  resolveSidePanelSlot,
  slotToLocation,
} from "./side-panel-slots";

describe("isSidePanelSlot", () => {
  it("accepts every slot this build renders", () => {
    for (const slot of SIDE_PANEL_SLOTS) {
      expect(isSidePanelSlot(slot)).toBe(true);
    }
  });

  it("rejects anything else, including non-strings", () => {
    for (const value of [
      "pane_7f3a",
      "left-top",
      "LEFT",
      "",
      undefined,
      null,
      0,
      {},
    ]) {
      expect(isSidePanelSlot(value)).toBe(false);
    }
  });
});

describe("slotToLocation", () => {
  it("maps each slot to its column", () => {
    expect(slotToLocation("left")).toBe("left");
    expect(slotToLocation("left-bottom")).toBe("left");
    expect(slotToLocation("right")).toBe("right");
    expect(slotToLocation("right-bottom")).toBe("right");
  });
});

describe("resolveSidePanelSlot", () => {
  it("honors an override naming a known slot", () => {
    expect(resolveSidePanelSlot("right-bottom", "left")).toBe("right-bottom");
    expect(resolveSidePanelSlot("left", "right")).toBe("left");
  });

  it("falls back to the registered location when there is no override", () => {
    expect(resolveSidePanelSlot(undefined, "right")).toBe("right");
  });

  // The RFC 0027 downgrade case: a workspace file written by a build with
  // free-form pane ids, read here. Without the fallback the panel matches no
  // slot and renders nowhere.
  it("falls back for a pane id this build does not know", () => {
    expect(resolveSidePanelSlot("pane_7f3a", "right")).toBe("right");
    expect(resolveSidePanelSlot("pane_7f3a", "left")).toBe("left");
  });

  it("resolves without mutating the caller's override", () => {
    const locations: Record<string, string> = { git: "pane_7f3a" };
    resolveSidePanelSlot(locations.git, "right");
    expect(locations.git).toBe("pane_7f3a");
  });
});
