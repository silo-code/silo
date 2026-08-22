import { describe, it, expect } from "vitest";
import { HOOK_INSTALLERS, installerFor } from "./install-strategy";
import type { AgentHookResume } from "@silo-code/extension-host/internal";

const STRATEGIES = [
  "claude-settings",
  "cursor-hooks-json",
  "copilot-hooks-dir",
  "pi-extension",
] as const;

describe("HOOK_INSTALLERS", () => {
  it("covers every HookInstallStrategy", () => {
    for (const strategy of STRATEGIES) {
      expect(HOOK_INSTALLERS[strategy]).toBeDefined();
      expect(typeof HOOK_INSTALLERS[strategy].isInstalled).toBe("function");
      expect(typeof HOOK_INSTALLERS[strategy].refreshIfDrifted).toBe(
        "function",
      );
      expect(typeof HOOK_INSTALLERS[strategy].write).toBe("function");
    }
  });

  it("installerFor selects by resume.installStrategy", () => {
    const resume = {
      installStrategy: "cursor-hooks-json",
    } as AgentHookResume;
    expect(installerFor(resume)).toBe(HOOK_INSTALLERS["cursor-hooks-json"]);
  });
});
