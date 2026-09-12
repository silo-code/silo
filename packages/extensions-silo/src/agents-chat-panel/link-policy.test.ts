import { describe, expect, it } from "vitest";
import { isLinkActivationClick, linkMenuLabels } from "./link-policy";

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
});

describe("linkMenuLabels", () => {
  it("names url vs path actions", () => {
    expect(linkMenuLabels("url")).toEqual({
      open: "Open Link",
      copy: "Copy Link",
    });
    expect(linkMenuLabels("path")).toEqual({
      open: "Open File",
      copy: "Copy Path",
    });
  });
});
