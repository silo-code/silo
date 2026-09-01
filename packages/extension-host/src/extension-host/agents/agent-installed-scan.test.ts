import { describe, it, expect, vi, beforeEach } from "vitest";

const { fsStat, fsReadDir, systemInfo, homeDir, exec } = vi.hoisted(() => ({
  fsStat: vi.fn(),
  fsReadDir: vi.fn(),
  systemInfo: vi.fn(),
  homeDir: vi.fn(),
  exec: vi.fn(),
}));

vi.mock("../../services/tauri-fs", () => ({ fsStat, fsReadDir }));
vi.mock("../../services/tauri-system", () => ({ systemInfo }));
vi.mock("../platform", () => ({ homeDir }));
vi.mock("../process-service", () => ({ getProcessService: () => ({ exec }) }));

import { scanInstalledAgents } from "./agent-installed-scan";

const HOME = "/Users/x";

/** A `fsStat` that reports a file at exactly `paths`, and nothing else. */
function statsFor(paths: readonly string[]) {
  return (path: string) =>
    Promise.resolve(
      paths.includes(path)
        ? { name: "x", path, isDir: false, size: 1, modifiedMs: 0 }
        : null,
    );
}

beforeEach(() => {
  vi.resetAllMocks();
  systemInfo.mockResolvedValue({ os: "macos", arch: "aarch64" });
  homeDir.mockResolvedValue(HOME);
  fsReadDir.mockRejectedValue(new Error("ENOENT"));
  fsStat.mockResolvedValue(null);
});

describe("scanInstalledAgents (RFC 0033 R12)", () => {
  it("never shells out — detection must not depend on the app's PATH", async () => {
    await scanInstalledAgents();
    expect(exec).not.toHaveBeenCalled();
  });

  it("maps a binary in a known install dir to its catalog id", async () => {
    fsStat.mockImplementation(
      statsFor([`${HOME}/.local/bin/claude`, "/opt/homebrew/bin/codex"]),
    );
    const found = await scanInstalledAgents();
    expect(found.map((f) => f.id).sort()).toEqual(["claude", "codex"]);
    const claude = found.find((f) => f.id === "claude")!;
    expect(claude.resolvedPath).toBe(`${HOME}/.local/bin/claude`);
    expect(claude.command).toBe("claude");
    expect(claude.displayName).toBeTruthy();
  });

  it("reports nothing when no candidate directory holds an agent", async () => {
    expect(await scanInstalledAgents()).toEqual([]);
  });

  it("finds an agent installed only under an nvm version dir", async () => {
    const bin = `${HOME}/.nvm/versions/node/v24.19.0/bin`;
    fsReadDir.mockResolvedValue([
      {
        name: "v24.19.0",
        path: `${HOME}/.nvm/versions/node/v24.19.0`,
        isDir: true,
        size: 0,
        modifiedMs: 0,
      },
    ]);
    fsStat.mockImplementation(statsFor([`${bin}/pi`]));
    const found = await scanInstalledAgents();
    expect(found.map((f) => f.id)).toContain("pi");
    expect(found.find((f) => f.id === "pi")!.resolvedPath).toBe(`${bin}/pi`);
  });

  it("ignores a directory that merely shares the agent's name", async () => {
    fsStat.mockImplementation((path: string) =>
      Promise.resolve(
        path === `${HOME}/.local/bin/claude`
          ? { name: "claude", path, isDir: true, size: 0, modifiedMs: 0 }
          : null,
      ),
    );
    expect(await scanInstalledAgents()).toEqual([]);
  });

  it("keeps probing past an unreadable directory", async () => {
    fsStat.mockImplementation((path: string) => {
      if (path.startsWith(`${HOME}/.local/bin`)) {
        return Promise.reject(new Error("EACCES"));
      }
      return statsFor(["/opt/homebrew/bin/codex"])(path);
    });
    const found = await scanInstalledAgents();
    expect(found.map((f) => f.id)).toContain("codex");
  });

  it("takes the first directory in probe order when an agent is in two", async () => {
    fsStat.mockImplementation(
      statsFor([`${HOME}/.local/bin/claude`, "/opt/homebrew/bin/claude"]),
    );
    const found = await scanInstalledAgents();
    expect(found.find((f) => f.id === "claude")!.resolvedPath).toBe(
      `${HOME}/.local/bin/claude`,
    );
  });

  it("reports nothing rather than guessing when home can't be resolved", async () => {
    homeDir.mockRejectedValue(new Error("no home"));
    expect(await scanInstalledAgents()).toEqual([]);
    expect(fsStat).not.toHaveBeenCalled();
  });
});
