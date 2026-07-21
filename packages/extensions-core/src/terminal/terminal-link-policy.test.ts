import { describe, expect, it } from "vitest";
import {
  isLinkActivationClick,
  linkMenuLabels,
  linkModifierLabel,
  linkTooltipText,
} from "./terminal-link-policy";

describe("linkModifierLabel", () => {
  it("shows the Cmd glyph on macOS", () => {
    expect(linkModifierLabel(true)).toBe("⌘");
  });

  it("shows Ctrl elsewhere", () => {
    expect(linkModifierLabel(false)).toBe("Ctrl");
  });
});

describe("isLinkActivationClick", () => {
  it("requires metaKey (not ctrlKey) on macOS", () => {
    expect(isLinkActivationClick({ metaKey: true, ctrlKey: false }, true)).toBe(
      true,
    );
    expect(isLinkActivationClick({ metaKey: false, ctrlKey: true }, true)).toBe(
      false,
    );
  });

  it("requires ctrlKey (not metaKey) off macOS", () => {
    expect(
      isLinkActivationClick({ metaKey: false, ctrlKey: true }, false),
    ).toBe(true);
    expect(
      isLinkActivationClick({ metaKey: true, ctrlKey: false }, false),
    ).toBe(false);
  });

  it("is false for a plain click with no modifier", () => {
    expect(
      isLinkActivationClick({ metaKey: false, ctrlKey: false }, true),
    ).toBe(false);
    expect(
      isLinkActivationClick({ metaKey: false, ctrlKey: false }, false),
    ).toBe(false);
  });
});

describe("linkTooltipText", () => {
  it("labels URLs as a link, macOS modifier", () => {
    expect(linkTooltipText("url", true)).toBe("Open link (⌘ + click)");
  });

  it("labels paths as a file, non-macOS modifier", () => {
    expect(linkTooltipText("path", false)).toBe("Open file (Ctrl + click)");
  });
});

describe("linkMenuLabels", () => {
  it("uses Link wording for URLs", () => {
    expect(linkMenuLabels("url")).toEqual({
      open: "Open Link",
      copy: "Copy Link",
    });
  });

  it("uses File/Path wording for paths", () => {
    expect(linkMenuLabels("path")).toEqual({
      open: "Open File",
      copy: "Copy Path",
    });
  });
});
