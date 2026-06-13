import { describe, it, expect } from "vitest";
import type { UpdatePhase } from "@silo-code/extension-host/internal";
import { updateLinkLabel, isUpdateActionable, buildUpdateLead } from "./model";

describe("updateLinkLabel", () => {
  it("shows the actionable link when an update is available", () => {
    expect(updateLinkLabel("available")).toBe("Update Silo");
    expect(isUpdateActionable("available")).toBe(true);
  });

  it("shows a disabled 'Installing…' label while installing", () => {
    expect(updateLinkLabel("installing")).toBe("Installing…");
    expect(isUpdateActionable("installing")).toBe(false);
  });

  it("renders nothing (and is not actionable) for every other phase", () => {
    const hidden: UpdatePhase[] = ["idle", "checking", "upToDate", "error"];
    for (const phase of hidden) {
      expect(updateLinkLabel(phase)).toBeNull();
      expect(isUpdateActionable(phase)).toBe(false);
    }
  });
});

describe("buildUpdateLead", () => {
  it("names the version when known", () => {
    expect(buildUpdateLead("1.2.3")).toBe("Silo 1.2.3 is ready to install.");
  });

  it("falls back to a generic phrase when the version is unknown", () => {
    expect(buildUpdateLead(null)).toBe(
      "A new version of Silo is ready to install.",
    );
  });
});
