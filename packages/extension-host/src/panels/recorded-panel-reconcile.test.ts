import { describe, it, expect } from "vitest";
import { reconcileRecordedPanels } from "./recorded-panel-reconcile";

describe("reconcileRecordedPanels (RFC 0041)", () => {
  it("is empty when the record list and the layout agree", () => {
    expect(
      reconcileRecordedPanels({
        recordPanelIds: ["acp-chat:a", "acp-chat:b"],
        layoutPanelIds: ["acp-chat:b", "acp-chat:a"],
      }),
    ).toEqual({ stale: [], float: [] });
  });

  it("flags a layout panel with no record (WorkspaceDock adopts it)", () => {
    expect(
      reconcileRecordedPanels({
        recordPanelIds: ["acp-chat:a"],
        layoutPanelIds: ["acp-chat:a", "acp-chat:gone"],
      }),
    ).toEqual({ stale: ["acp-chat:gone"], float: [] });
  });

  it("flags a record with no geometry to float back in", () => {
    expect(
      reconcileRecordedPanels({
        recordPanelIds: ["acp-chat:a", "acp-chat:new"],
        layoutPanelIds: ["acp-chat:a"],
      }),
    ).toEqual({ stale: [], float: ["acp-chat:new"] });
  });

  it("handles both directions at once, preserving input order", () => {
    expect(
      reconcileRecordedPanels({
        recordPanelIds: ["acp-chat:keep", "acp-chat:float1", "acp-chat:float2"],
        layoutPanelIds: ["acp-chat:stale1", "acp-chat:keep", "acp-chat:stale2"],
      }),
    ).toEqual({
      stale: ["acp-chat:stale1", "acp-chat:stale2"],
      float: ["acp-chat:float1", "acp-chat:float2"],
    });
  });

  it("a fresh workspace with no recorded panels is a no-op", () => {
    expect(
      reconcileRecordedPanels({ recordPanelIds: [], layoutPanelIds: [] }),
    ).toEqual({ stale: [], float: [] });
  });
});
