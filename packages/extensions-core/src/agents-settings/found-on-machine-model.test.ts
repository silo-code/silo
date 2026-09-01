import { describe, it, expect } from "vitest";
import {
  profileIdForCatalogAgent,
  shouldShowFoundAgentCard,
} from "./found-on-machine-model";

describe("profileIdForCatalogAgent", () => {
  it("slugifies to lowercase letters, digits, and hyphens", () => {
    expect(profileIdForCatalogAgent("claude")).toBe("claude");
    expect(profileIdForCatalogAgent("cursor-agent")).toBe("cursor-agent");
  });
});

describe("shouldShowFoundAgentCard", () => {
  it("hides when assumedAgentId is already covered", () => {
    expect(
      shouldShowFoundAgentCard("claude", new Set(["claude"]), new Set()),
    ).toBe(false);
  });

  it("hides when the default profile id already exists", () => {
    expect(
      shouldShowFoundAgentCard("claude", new Set(), new Set(["claude"])),
    ).toBe(false);
  });

  it("shows when neither agent nor default id is taken", () => {
    expect(
      shouldShowFoundAgentCard("claude", new Set(), new Set(["claude-work"])),
    ).toBe(true);
  });
});
