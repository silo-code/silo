import { beforeEach, describe, expect, it } from "vitest";
import {
  nextSheetKey,
  pushInset,
  pushOffset,
  pushSheet,
  pushSheetsOn,
  removeSheet,
  sheetStack,
  updateSheet,
  type OpenSheet,
} from "./sheet-service";

function sheet(over: Partial<OpenSheet> = {}): OpenSheet {
  return {
    id: nextSheetKey(),
    align: "left",
    anchor: "dock",
    mode: "push",
    widthPx: 400,
    ...over,
  };
}

beforeEach(() => {
  sheetStack.open.length = 0;
});

describe("the sheet stack", () => {
  it("registers in open order and drops on close", () => {
    const a = sheet();
    const b = sheet();
    pushSheet(a);
    pushSheet(b);
    expect(sheetStack.open.map((s) => s.id)).toEqual([a.id, b.id]);
    removeSheet(a.id);
    expect(sheetStack.open.map((s) => s.id)).toEqual([b.id]);
  });

  it("ignores a re-registration of the same sheet", () => {
    const a = sheet();
    pushSheet(a);
    pushSheet(a);
    expect(sheetStack.open).toHaveLength(1);
  });

  it("tolerates closing a sheet that is already gone", () => {
    expect(() => removeSheet("never-opened")).not.toThrow();
  });

  it("re-records a width when the window resizes under an open sheet", () => {
    const a = sheet({ widthPx: 400 });
    pushSheet(a);
    updateSheet(a.id, { widthPx: 640 });
    expect(sheetStack.open[0].widthPx).toBe(640);
  });
});

describe("push insets", () => {
  it("counts only push sheets on the asked-for side", () => {
    const open = [
      sheet({ align: "left", mode: "push", widthPx: 400 }),
      sheet({ align: "left", mode: "overlay", widthPx: 900 }),
      sheet({ align: "right", mode: "push", widthPx: 300 }),
    ];
    expect(pushSheetsOn(open, "left")).toHaveLength(1);
    expect(pushInset(open, "left")).toBe(400);
    expect(pushInset(open, "right")).toBe(300);
  });

  it("is zero with nothing open", () => {
    expect(pushInset([], "left")).toBe(0);
  });

  it("sums two push sheets on the same side so both fit", () => {
    const first = sheet({ widthPx: 400 });
    const second = sheet({ widthPx: 250 });
    const open = [first, second];
    expect(pushInset(open, "left")).toBe(650);
    // The first sits against the dock; the second stacks beyond it.
    expect(pushOffset(open, first.id, "left")).toBe(0);
    expect(pushOffset(open, second.id, "left")).toBe(400);
  });

  it("gives an overlay sheet no offset — it doesn't sit in the pushed gap", () => {
    const overlay = sheet({ mode: "overlay" });
    expect(pushOffset([overlay], overlay.id, "left")).toBe(0);
  });
});
