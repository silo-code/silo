import { describe, expect, it, vi } from "vitest";
import type { MenuItem } from "@silo-code/sdk";
import { buildChatSelectionMenu } from "./selection-menu";

const item = (
  entries: ReturnType<typeof buildChatSelectionMenu>,
  label: string,
) =>
  entries.find((e) => "label" in e && e.label === label) as
    | MenuItem
    | undefined;

const base = {
  cmdKey: "⌘",
  onCopy: () => {},
  onSelectAll: () => {},
};

describe("buildChatSelectionMenu", () => {
  it("offers Copy and Select All when the click is not on a link", () => {
    const items = buildChatSelectionMenu({ ...base, selection: "hi" });
    expect(items.map((e) => ("label" in e ? e.label : `<${e.type}>`))).toEqual([
      "Copy",
      "Select All",
    ]);
  });

  it("disables Copy when there is no selection", () => {
    const items = buildChatSelectionMenu({ ...base, selection: "" });
    expect(item(items, "Copy")?.disabled).toBe(true);
  });

  it("puts Open / Copy link above the clipboard rows when the click is on a URL", () => {
    const onOpenLink = vi.fn();
    const onCopyLink = vi.fn();
    const items = buildChatSelectionMenu({
      ...base,
      selection: "",
      link: { kind: "url", text: "https://getsilo.dev" },
      onOpenLink,
      onCopyLink,
    });
    expect(items.map((e) => ("label" in e ? e.label : `<${e.type}>`))).toEqual([
      "Open Link",
      "Copy Link",
      "<separator>",
      "Copy",
      "Select All",
    ]);
    item(items, "Open Link")?.run?.();
    item(items, "Copy Link")?.run?.();
    expect(onOpenLink).toHaveBeenCalledOnce();
    expect(onCopyLink).toHaveBeenCalledOnce();
  });

  it("names file-path actions Open File / Copy Path", () => {
    const items = buildChatSelectionMenu({
      ...base,
      selection: "x",
      link: { kind: "path", text: "src/a.ts" },
      onOpenLink: () => {},
      onCopyLink: () => {},
    });
    expect(item(items, "Open File")).toBeDefined();
    expect(item(items, "Copy Path")).toBeDefined();
  });
});
