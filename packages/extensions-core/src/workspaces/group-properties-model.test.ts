import { describe, it, expect } from "vitest";
import { resolveGroupProps } from "./group-properties-model";

describe("resolveGroupProps — create mode", () => {
  const initial = { name: "", color: undefined };

  it("cannot submit with an empty name", () => {
    const r = resolveGroupProps("create", initial, {
      name: "",
      color: undefined,
    });
    expect(r.canSubmit).toBe(false);
  });

  it("cannot submit when the name is only whitespace", () => {
    const r = resolveGroupProps("create", initial, {
      name: "   ",
      color: "#61afef",
    });
    expect(r.canSubmit).toBe(false);
  });

  it("can submit with a name, even when no color is chosen", () => {
    const r = resolveGroupProps("create", initial, {
      name: "Work",
      color: undefined,
    });
    expect(r.canSubmit).toBe(true);
    expect(r.changes).toEqual({ name: "Work", color: undefined });
  });

  it("trims the name and carries the chosen color through", () => {
    const r = resolveGroupProps("create", initial, {
      name: "  Chalk  ",
      color: "#e06c75",
    });
    expect(r.changes).toEqual({ name: "Chalk", color: "#e06c75" });
  });
});

describe("resolveGroupProps — edit mode", () => {
  const initial = { name: "Silo", color: "#c678dd" };

  it("cannot submit when nothing changed", () => {
    const r = resolveGroupProps("edit", initial, {
      name: "Silo",
      color: "#c678dd",
    });
    expect(r.canSubmit).toBe(false);
  });

  it("can submit when only the name changed", () => {
    const r = resolveGroupProps("edit", initial, {
      name: "Silo 2",
      color: "#c678dd",
    });
    expect(r.canSubmit).toBe(true);
    expect(r.changes.name).toBe("Silo 2");
  });

  it("can submit when only the color changed", () => {
    const r = resolveGroupProps("edit", initial, {
      name: "Silo",
      color: undefined,
    });
    expect(r.canSubmit).toBe(true);
    expect(r.changes.color).toBeUndefined();
  });

  it("treats a blank name as unchanged and reverts to the original", () => {
    const r = resolveGroupProps("edit", initial, {
      name: "   ",
      color: "#c678dd",
    });
    expect(r.canSubmit).toBe(false);
    expect(r.changes.name).toBe("Silo");
  });

  it("reverts a blanked name but still commits a color change", () => {
    const r = resolveGroupProps("edit", initial, {
      name: "",
      color: "#98c379",
    });
    expect(r.canSubmit).toBe(true);
    expect(r.changes).toEqual({ name: "Silo", color: "#98c379" });
  });
});
