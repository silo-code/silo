import { describe, it, expect, afterEach } from "vitest";
import {
  getPendingSheetDialog,
  resolveSheetDialog,
  sheetDialogStore,
  showSheetDialog,
} from "./sheet-dialog";

// The imperative queue behind `ctx.layout.openPanelSheet`: covers the
// store/promise logic here, mirroring modal-service.test.ts's "custom
// modals" block — the React rendering half lives in SheetDialogHost.

const ids = () => sheetDialogStore.entries.map((e) => e.id);

afterEach(() => {
  // Drain anything a failing assertion might have left open.
  for (const id of ids()) resolveSheetDialog(id);
});

describe("showSheetDialog", () => {
  it("enqueues an entry and stores render/options/side off-proxy", () => {
    const render = () => null;
    void showSheetDialog(render, { title: "Hi", width: 400 }, "right");

    expect(ids()).toHaveLength(1);
    const entry = getPendingSheetDialog(ids()[0]);
    expect(entry?.render).toBe(render);
    expect(entry?.options).toEqual({ title: "Hi", width: 400 });
    expect(entry?.side).toBe("right");
  });

  it("resolves with no value and clears the entry", async () => {
    const promise = showSheetDialog(() => null, undefined, "left");
    const id = ids()[0];

    resolveSheetDialog(id);

    await expect(promise).resolves.toBeUndefined();
    expect(ids()).not.toContain(id);
    expect(getPendingSheetDialog(id)).toBeUndefined();
  });

  it("a second resolve is a no-op (double-close is safe)", async () => {
    const promise = showSheetDialog(() => null, undefined, "left");
    const id = ids()[0];

    resolveSheetDialog(id);
    expect(() => resolveSheetDialog(id)).not.toThrow();

    await expect(promise).resolves.toBeUndefined();
  });

  it("stacks independently — settling one leaves the other open", () => {
    void showSheetDialog(() => null, undefined, "left");
    void showSheetDialog(() => null, undefined, "right");
    const [first, second] = ids();

    resolveSheetDialog(first);

    expect(ids()).toEqual([second]);
    expect(getPendingSheetDialog(second)).toBeDefined();
  });
});
