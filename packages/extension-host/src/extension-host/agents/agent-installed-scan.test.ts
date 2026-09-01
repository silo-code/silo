import { describe, it, expect, vi, beforeEach } from "vitest";

const { exec } = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock("../process-service", () => ({
  getProcessService: () => ({ exec }),
}));

import { scanInstalledAgents } from "./agent-installed-scan";

beforeEach(() => exec.mockReset());

describe("scanInstalledAgents (RFC 0033 R12)", () => {
  it("uses non-interactive `sh -c 'command -v …'`, never the interactive shell", async () => {
    exec.mockResolvedValue({ stdout: "", stderr: "", code: 1 });
    await scanInstalledAgents();
    for (const call of exec.mock.calls) {
      expect(call[0]).toBe("sh");
      expect(call[1][0]).toBe("-c");
      expect(call[1][1]).toMatch(/^command -v /);
      expect(call[1]).not.toContain("-i");
    }
  });

  it("maps PATH hits to catalog ids with the resolved path", async () => {
    exec.mockImplementation((...callArgs: unknown[]) => {
      const script = String((callArgs[1] as string[])?.[1] ?? "");
      const hit = script.includes("claude") || script.includes("codex");
      return Promise.resolve({
        stdout: hit ? "/opt/homebrew/bin/x\n" : "",
        stderr: "",
        code: hit ? 0 : 1,
      });
    });
    const found = await scanInstalledAgents();
    const ids = found.map((f) => f.id).sort();
    expect(ids).toEqual(["claude", "codex"]);
    expect(found[0].resolvedPath).toBe("/opt/homebrew/bin/x");
    expect(found[0].command).toBeTruthy();
    expect(found[0].displayName).toBeTruthy();
  });
});
