import { describe, it, expect } from "vitest";
import { listRowDataSelected, listRowNameTruncate } from "./list-classes";

describe("listRowDataSelected", () => {
  it("sets data-selected=true when selected", () => {
    expect(listRowDataSelected(true)).toBe("true");
  });

  it("omits the attribute when not selected", () => {
    expect(listRowDataSelected(false)).toBeUndefined();
  });
});

describe("listRowNameTruncate", () => {
  it("defaults to end truncation (no data attribute)", () => {
    expect(listRowNameTruncate()).toBeUndefined();
    expect(listRowNameTruncate("end")).toBeUndefined();
  });

  it("sets data-truncate=start for front truncation", () => {
    expect(listRowNameTruncate("start")).toBe("start");
  });
});
