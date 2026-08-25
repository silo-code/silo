import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/tauri-system", () => ({
  systemInfo: vi.fn(),
}));
vi.mock("../services/tauri-app", () => ({
  appVersion: vi.fn(),
}));
vi.mock("./platform", () => ({
  homeDir: vi.fn(),
}));

import { systemInfo } from "../services/tauri-system";
import { appVersion } from "../services/tauri-app";
import { homeDir as platformHomeDir } from "./platform";

// Re-import the module under test after mocks are in place.
// Each test re-imports to reset the module-level singleton.
async function freshService() {
  vi.resetModules();
  const mod = await import("./system-service");
  return mod.getSystemService();
}

describe("SystemService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(systemInfo).mockResolvedValue({ os: "macos", arch: "aarch64" });
    vi.mocked(appVersion).mockResolvedValue("1.2.3");
    vi.mocked(platformHomeDir).mockResolvedValue("/Users/dave");
  });

  it("returns correctly shaped SystemInfo", async () => {
    const svc = await freshService();
    const info = await svc.getInfo();
    expect(info).toEqual({
      os: "macos",
      arch: "aarch64",
      siloVersion: "1.2.3",
    });
  });

  it("caches the result — tauri calls happen only once across multiple getInfo() calls", async () => {
    const svc = await freshService();
    await svc.getInfo();
    await svc.getInfo();
    await svc.getInfo();
    expect(systemInfo).toHaveBeenCalledTimes(1);
    expect(appVersion).toHaveBeenCalledTimes(1);
  });

  it("getSystemService() returns the same singleton instance", async () => {
    vi.resetModules();
    const mod = await import("./system-service");
    const a = mod.getSystemService();
    const b = mod.getSystemService();
    expect(a).toBe(b);
  });

  describe("homeDir", () => {
    it("resolves the platform home directory", async () => {
      const svc = await freshService();
      await expect(svc.homeDir()).resolves.toBe("/Users/dave");
    });

    it("caches the result — the platform call happens only once across multiple calls", async () => {
      const svc = await freshService();
      await svc.homeDir();
      await svc.homeDir();
      await svc.homeDir();
      expect(platformHomeDir).toHaveBeenCalledTimes(1);
    });
  });
});
