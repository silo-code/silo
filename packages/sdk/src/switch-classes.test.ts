import { describe, it, expect } from "vitest";
import { switchDataChecked } from "./switch-classes";

describe("switchDataChecked", () => {
  it("returns the string true/false the host CSS keys on", () => {
    expect(switchDataChecked(true)).toBe("true");
    expect(switchDataChecked(false)).toBe("false");
  });
});
