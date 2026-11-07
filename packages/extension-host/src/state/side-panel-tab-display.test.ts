import { describe, it, expect } from "vitest";
import type { SidePanel, SidePanelTabDisplay } from "@silo-code/sdk";
import {
  DEFAULT_SIDE_PANEL_TAB_DISPLAY,
  SIDE_PANEL_TAB_DISPLAY_MODES,
  coerceTabDisplay,
  resolveTabDisplay,
} from "./side-panel-tab-display";

function panel(id: string, withIcon: boolean): SidePanel {
  return {
    id,
    title: id,
    location: "right",
    component: () => null,
    ...(withIcon ? { icon: "glyph" } : {}),
  };
}

describe("coerceTabDisplay", () => {
  it("passes every real mode through", () => {
    for (const mode of SIDE_PANEL_TAB_DISPLAY_MODES) {
      expect(coerceTabDisplay(mode)).toBe(mode);
    }
  });

  it("falls back to title-only for anything else", () => {
    // The persisted map is keyed by panel id and hand-editable, so these are
    // the shapes a real app-state.json can actually contain.
    for (const junk of [
      undefined,
      null,
      "",
      "Icon",
      "icon-only",
      0,
      1,
      true,
      {},
      [],
    ]) {
      expect(coerceTabDisplay(junk)).toBe("title");
    }
  });

  it("defaults to title-only, i.e. the pre-icon rendering", () => {
    expect(DEFAULT_SIDE_PANEL_TAB_DISPLAY).toBe("title");
  });
});

describe("resolveTabDisplay", () => {
  it("is title-only for a panel with nothing stored", () => {
    expect(resolveTabDisplay(panel("git", true), {})).toBe("title");
  });

  it("honours each stored mode for a panel that has an icon", () => {
    for (const mode of SIDE_PANEL_TAB_DISPLAY_MODES) {
      expect(resolveTabDisplay(panel("git", true), { git: mode })).toBe(mode);
    }
  });

  it("clamps an icon-bearing mode to title when the panel has no icon", () => {
    // A third-party panel built against an older SDK, or one that dropped its
    // icon in an update, must not render an empty tab for a stale stored mode.
    expect(resolveTabDisplay(panel("tasks", false), { tasks: "icon" })).toBe(
      "title",
    );
    expect(resolveTabDisplay(panel("tasks", false), { tasks: "both" })).toBe(
      "title",
    );
  });

  it("re-narrows a junk stored value", () => {
    const modes = { git: "wat" } as unknown as Record<
      string,
      SidePanelTabDisplay
    >;
    expect(resolveTabDisplay(panel("git", true), modes)).toBe("title");
  });

  it("reads only its own panel's key", () => {
    expect(resolveTabDisplay(panel("git", true), { files: "icon" })).toBe(
      "title",
    );
  });
});
