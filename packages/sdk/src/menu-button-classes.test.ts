import { describe, expect, it } from "vitest";
import { menuButtonClass } from "./menu-button-classes";

// Pins the host contract classes (components.css) so renaming one fails here
// rather than silently unstyling every extension's menu triggers.
describe("menuButtonClass", () => {
  it("defaults to the base class", () => {
    expect(menuButtonClass()).toBe("silo-menu-button");
    expect(menuButtonClass("normal")).toBe("silo-menu-button");
    expect(menuButtonClass("normal", "bare")).toBe("silo-menu-button");
  });

  it("composes the compact modifier onto the base, like .silo-button-sm", () => {
    expect(menuButtonClass("sm")).toBe("silo-menu-button silo-menu-button-sm");
  });

  it("composes the field variant onto the base", () => {
    expect(menuButtonClass("normal", "field")).toBe(
      "silo-menu-button silo-menu-button-field",
    );
  });

  it("composes size and variant together", () => {
    expect(menuButtonClass("sm", "field")).toBe(
      "silo-menu-button silo-menu-button-sm silo-menu-button-field",
    );
  });
});
