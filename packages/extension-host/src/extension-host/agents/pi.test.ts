import { describe, it, expect } from "vitest";
import { buildPiAgentDefinition } from "./pi";

const pi = buildPiAgentDefinition({
  marker: "silo-managed-agent-hook",
  trackScriptRel: ".silo/agent-hooks/track-session.sh",
  buildHookCommand: (agentId) => `sh "$HOME/track.sh" ${agentId}`,
});

describe("pi's extraSettingsToggle", () => {
  const toggle = pi.extraSettingsToggle;
  if (!toggle) throw new Error("pi must declare extraSettingsToggle");

  it("settingsPathRel points at pi's global settings file", () => {
    expect(toggle.settingsPathRel).toBe(".pi/agent/settings.json");
  });

  describe("isEnabled", () => {
    it("defaults to false when unset", () => {
      expect(toggle.isEnabled({})).toBe(false);
      expect(toggle.isEnabled({ terminal: {} })).toBe(false);
    });

    it("reads the stored flag", () => {
      expect(
        toggle.isEnabled({ terminal: { showTerminalProgress: true } }),
      ).toBe(true);
    });
  });

  describe("setEnabled", () => {
    it("sets terminal.showTerminalProgress without clobbering other keys", () => {
      const base = {
        theme: "dark",
        terminal: { showTerminalProgress: false },
        defaultModel: "gpt-4",
      };
      const next = toggle.setEnabled(base, true);
      expect(next).toEqual({
        theme: "dark",
        terminal: { showTerminalProgress: true },
        defaultModel: "gpt-4",
      });
      // Pure — the input object is untouched.
      expect(
        (base.terminal as { showTerminalProgress: boolean })
          .showTerminalProgress,
      ).toBe(false);
    });

    it("creates terminal when absent", () => {
      expect(toggle.setEnabled({}, true)).toEqual({
        terminal: { showTerminalProgress: true },
      });
    });

    it("can turn progress off", () => {
      expect(
        toggle.setEnabled({ terminal: { showTerminalProgress: true } }, false),
      ).toEqual({ terminal: { showTerminalProgress: false } });
    });
  });
});
