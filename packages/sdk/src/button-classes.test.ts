import { describe, it, expect } from "vitest";
import { buttonClass } from "./button-classes";

describe("buttonClass", () => {
  it("maps normal variant to silo-button", () => {
    expect(buttonClass("normal")).toBe("silo-button");
    expect(buttonClass()).toBe("silo-button");
  });

  it("maps primary and danger to their standalone classes", () => {
    expect(buttonClass("primary")).toBe("silo-button-primary");
    expect(buttonClass("danger")).toBe("silo-button-danger");
  });

  it("composes silo-button-sm onto any variant", () => {
    expect(buttonClass("normal", "sm")).toBe("silo-button silo-button-sm");
    expect(buttonClass("primary", "sm")).toBe(
      "silo-button-primary silo-button-sm",
    );
    expect(buttonClass("danger", "sm")).toBe(
      "silo-button-danger silo-button-sm",
    );
  });
});
