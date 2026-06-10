import { describe, it, expect } from "vitest";
import { configRootName } from "./user-config";

describe("configRootName", () => {
  it("maps the production identity to the bare 'silo' root", () => {
    expect(configRootName("com.silo.desktop")).toBe("silo");
  });

  it("maps a build-suffixed identity to silo-<suffix>", () => {
    expect(configRootName("com.silo.desktop.dev")).toBe("silo-dev");
  });

  it("falls back to silo-<identifier> for an unexpected identity", () => {
    expect(configRootName("com.example.other")).toBe("silo-com.example.other");
  });
});
