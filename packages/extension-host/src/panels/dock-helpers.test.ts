import { describe, expect, it } from "vitest";
import { panelToReactivateOnClose } from "./dock-helpers";

describe("panelToReactivateOnClose", () => {
  it("returns null when the closed tab WAS the active one (let dockview's within-group MRU pick)", () => {
    // Closing the tab you're focused in: keep dockview's within-group MRU.
    expect(panelToReactivateOnClose("editor:a", "editor:a")).toBeNull();
  });

  it("re-asserts the active tab when a DIFFERENT tab is closed (cross-group focus theft)", () => {
    // You're on editor:a (group A); you close terminal:x (group B). Stay on a.
    expect(panelToReactivateOnClose("terminal:x", "editor:a")).toBe("editor:a");
  });

  it("works across kinds — closing an editor while a terminal is active keeps the terminal", () => {
    expect(panelToReactivateOnClose("editor:b", "terminal:t")).toBe(
      "terminal:t",
    );
  });

  it("returns null when nothing was active before the close", () => {
    expect(panelToReactivateOnClose("editor:a", null)).toBeNull();
    expect(panelToReactivateOnClose("editor:a", undefined)).toBeNull();
  });
});
