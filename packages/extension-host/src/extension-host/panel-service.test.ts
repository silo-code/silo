import { describe, it, expect } from "vitest";
import { getPanelService } from "./panel-service";
import { tabAdornmentRegistry } from "./tab-adornment-registry";

describe("getPanelService", () => {
  it("returns the same instance on every call", () => {
    expect(getPanelService()).toBe(getPanelService());
  });

  it('scopes adornments to the "panel" kind, isolated from editor/terminal', () => {
    const svc = getPanelService();
    svc.setHighlight("silo.agents-chat-panel:p1", {
      id: "acme.follow-up",
      color: "warn",
    });
    expect(svc.getHighlight("silo.agents-chat-panel:p1")).toEqual({
      id: "acme.follow-up",
      color: "warn",
    });
    expect(
      tabAdornmentRegistry.getHighlight("panel", "silo.agents-chat-panel:p1"),
    ).toEqual({ id: "acme.follow-up", color: "warn" });
    expect(
      tabAdornmentRegistry.getHighlight("editor", "silo.agents-chat-panel:p1"),
    ).toBeNull();
    svc.clearHighlight("silo.agents-chat-panel:p1", "acme.follow-up");
  });
});
