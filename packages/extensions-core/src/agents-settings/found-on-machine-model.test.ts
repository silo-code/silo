import { describe, it, expect } from "vitest";
import {
  foundAgentActions,
  foundAgentModesLabel,
  profileIdForCatalogAgent,
  type AgentMode,
} from "./found-on-machine-model";

const NONE: ReadonlySet<AgentMode> = new Set();
const NO_IDS: ReadonlySet<string> = new Set();

/** Coverage with sensible defaults; override per case. */
function cov(over: Partial<Parameters<typeof foundAgentActions>[1]> = {}) {
  return {
    supportsChat: true,
    chatHostInstalled: true,
    coveredModes: NONE,
    existingProfileIds: NO_IDS,
    ...over,
  };
}

describe("profileIdForCatalogAgent", () => {
  it("slugifies to lowercase letters, digits, and hyphens", () => {
    expect(profileIdForCatalogAgent("claude")).toBe("claude");
    expect(profileIdForCatalogAgent("cursor-agent")).toBe("cursor-agent");
  });

  it("suffixes the Chat mode so both modes can coexist for one agent", () => {
    expect(profileIdForCatalogAgent("claude", "chat")).toBe("claude-chat");
    expect(profileIdForCatalogAgent("claude", "terminal")).toBe("claude");
  });
});

describe("foundAgentModesLabel", () => {
  it("lists Chat only when the agent supports it", () => {
    expect(foundAgentModesLabel(true)).toBe("Terminal · Chat");
    expect(foundAgentModesLabel(false)).toBe("Terminal");
  });
});

describe("foundAgentActions", () => {
  it("offers both modes for a fresh Chat-capable agent with a host installed", () => {
    expect(foundAgentActions("claude", cov())).toEqual({
      terminal: true,
      chat: true,
    });
  });

  it("offers Terminal only when the agent has no ACP path", () => {
    expect(foundAgentActions("grok", cov({ supportsChat: false }))).toEqual({
      terminal: true,
      chat: false,
    });
  });

  it("offers Terminal only when no Chat panel is installed", () => {
    expect(
      foundAgentActions("claude", cov({ chatHostInstalled: false })),
    ).toEqual({ terminal: true, chat: false });
  });

  it("drops the Terminal action once a Terminal profile covers the agent", () => {
    expect(
      foundAgentActions("claude", cov({ coveredModes: new Set(["terminal"]) })),
    ).toEqual({ terminal: false, chat: true });
  });

  it("hides the card entirely once every supported mode is covered", () => {
    expect(
      foundAgentActions(
        "claude",
        cov({ coveredModes: new Set(["terminal", "chat"]) }),
      ),
    ).toBeNull();
    // Terminal-only agent: a single Terminal profile is full coverage.
    expect(
      foundAgentActions(
        "grok",
        cov({ supportsChat: false, coveredModes: new Set(["terminal"]) }),
      ),
    ).toBeNull();
  });

  it("blocks a mode whose one-click id collides with a hand-named profile", () => {
    expect(
      foundAgentActions(
        "claude",
        cov({ existingProfileIds: new Set(["claude", "claude-chat"]) }),
      ),
    ).toBeNull();
  });
});
