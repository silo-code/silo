import { describe, it, expect, vi } from "vitest";
import type { MenuItem } from "@silo-code/sdk";
import { buildPreviewMenuItems } from "./menu";

const item = (
  entries: ReturnType<typeof buildPreviewMenuItems>,
  label: string,
) =>
  entries.find((e) => "label" in e && e.label === label) as
    | MenuItem
    | undefined;

describe("buildPreviewMenuItems", () => {
  it("offers the clipboard trio plus Select All", () => {
    const items = buildPreviewMenuItems({
      selection: "hi",
      onCopy: () => {},
      onSelectAll: () => {},
    });
    const labels = items.map((e) => ("label" in e ? e.label : `<${e.type}>`));
    expect(labels).toEqual([
      "Cut",
      "Copy",
      "Paste",
      "<separator>",
      "Select All",
    ]);
  });

  it("always disables Cut and Paste (read-only preview)", () => {
    const items = buildPreviewMenuItems({
      selection: "anything",
      onCopy: () => {},
      onSelectAll: () => {},
    });
    expect(item(items, "Cut")?.disabled).toBe(true);
    expect(item(items, "Paste")?.disabled).toBe(true);
  });

  it("enables Copy only when there is a selection", () => {
    const withSel = buildPreviewMenuItems({
      selection: "picked",
      onCopy: () => {},
      onSelectAll: () => {},
    });
    const noSel = buildPreviewMenuItems({
      selection: "",
      onCopy: () => {},
      onSelectAll: () => {},
    });
    expect(item(withSel, "Copy")?.disabled).toBe(false);
    expect(item(noSel, "Copy")?.disabled).toBe(true);
  });

  it("wires Copy and Select All to their actions", () => {
    const onCopy = vi.fn();
    const onSelectAll = vi.fn();
    const items = buildPreviewMenuItems({
      selection: "x",
      onCopy,
      onSelectAll,
    });
    item(items, "Copy")?.run?.();
    item(items, "Select All")?.run?.();
    expect(onCopy).toHaveBeenCalledOnce();
    expect(onSelectAll).toHaveBeenCalledOnce();
  });
});
