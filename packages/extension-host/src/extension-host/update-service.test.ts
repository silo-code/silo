// Unit test for the host UpdateService: the Tauri seam (services/updater),
// the changelog client, and the analytics reporter are mocked, so this stays
// a fast, app-free unit. The service is a module singleton, so each test
// re-imports it fresh (`vi.resetModules`) to get clean state.

import { describe, it, expect, beforeEach, vi } from "vitest";

const seam = vi.hoisted(() => ({
  isStableApp: vi.fn(),
  checkForUpdate: vi.fn(),
  installUpdate: vi.fn(),
}));

const changelogSeam = vi.hoisted(() => ({
  fetchChangelog: vi.fn(),
}));

const analyticsSeam = vi.hoisted(() => ({
  reportUpdateAction: vi.fn(),
}));

vi.mock("../services/updater", () => seam);
// Real changelogRange (pure logic, already covered by changelog-client.test.ts)
// stays in play; only the network call is mocked.
vi.mock("./changelog-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./changelog-client")>();
  return { ...actual, fetchChangelog: changelogSeam.fetchChangelog };
});
vi.mock("../services/update-analytics", () => analyticsSeam);

beforeEach(() => {
  vi.resetModules();
  seam.isStableApp.mockReset();
  seam.checkForUpdate.mockReset();
  seam.installUpdate.mockReset();
  changelogSeam.fetchChangelog.mockReset();
  analyticsSeam.reportUpdateAction.mockReset().mockResolvedValue(undefined);
});

async function freshService() {
  const mod = await import("./update-service");
  return mod.getUpdateService();
}

describe("UpdateService.check", () => {
  it("no-ops (stays idle) outside the packaged stable app", async () => {
    seam.isStableApp.mockResolvedValue(false);
    const svc = await freshService();

    await svc.check();

    expect(svc.getState()).toEqual({ phase: "idle", version: null });
    expect(seam.checkForUpdate).not.toHaveBeenCalled();
  });

  it("transitions to 'available' and records the version when a release exists", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue({ version: "9.9.9" });
    const svc = await freshService();

    await svc.check();

    expect(svc.getState()).toEqual({ phase: "available", version: "9.9.9" });
  });

  it("transitions to 'upToDate' when there is no release", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(null);
    const svc = await freshService();

    await svc.check();

    expect(svc.getState()).toEqual({ phase: "upToDate", version: null });
  });

  it("transitions to 'error' when the check throws", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockRejectedValue(new Error("network"));
    const svc = await freshService();

    await svc.check();

    expect(svc.getState().phase).toBe("error");
  });

  it("notifies subscribers on state change", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue({ version: "2.0.0" });
    const svc = await freshService();
    const seen: string[] = [];
    svc.subscribe((s) => seen.push(s.phase));

    await svc.check();

    expect(seen).toContain("available");
  });
});

describe("UpdateService.installAndRelaunch", () => {
  it("installs the release found by the last check", async () => {
    const update = { version: "9.9.9" };
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(update);
    seam.installUpdate.mockResolvedValue(undefined);
    const svc = await freshService();

    await svc.check();
    await svc.installAndRelaunch();

    expect(seam.installUpdate).toHaveBeenCalledWith(update);
  });

  it("is a no-op when no update is pending", async () => {
    const svc = await freshService();

    await svc.installAndRelaunch();

    expect(seam.installUpdate).not.toHaveBeenCalled();
  });

  it("marks the phase 'installing' while the install runs", async () => {
    const update = { version: "9.9.9" };
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(update);
    let phaseDuringInstall: string | undefined;
    const svc = await freshService();
    seam.installUpdate.mockImplementation(async () => {
      phaseDuringInstall = svc.getState().phase;
    });

    await svc.check();
    await svc.installAndRelaunch();

    expect(phaseDuringInstall).toBe("installing");
  });

  it("does not start a second install while one is in flight (re-entry guard)", async () => {
    const update = { version: "9.9.9" };
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(update);
    // Never resolves — keeps the first install "in flight".
    seam.installUpdate.mockReturnValue(new Promise(() => {}));
    const svc = await freshService();

    await svc.check();
    void svc.installAndRelaunch();
    await svc.installAndRelaunch(); // second click

    expect(seam.installUpdate).toHaveBeenCalledTimes(1);
  });

  it("reverts to 'available' and re-throws when the install fails", async () => {
    const update = { version: "9.9.9" };
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(update);
    seam.installUpdate.mockRejectedValue(new Error("download failed"));
    const svc = await freshService();

    await svc.check();
    await expect(svc.installAndRelaunch()).rejects.toThrow("download failed");
    expect(svc.getState().phase).toBe("available");

    // The release is still pending, so a retry attempts the install again.
    seam.installUpdate.mockResolvedValue(undefined);
    await svc.installAndRelaunch();
    expect(seam.installUpdate).toHaveBeenCalledTimes(2);
  });
});

describe("UpdateService.getChangelog", () => {
  const availableUpdate = {
    version: "2.0.0",
    currentVersion: "1.0.0",
    date: "2026-08-10",
    body: "fallback notes for 2.0.0",
  };

  it("returns [] when no update is available", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(null);
    const svc = await freshService();
    await svc.check();

    expect(await svc.getChangelog()).toEqual([]);
    expect(changelogSeam.fetchChangelog).not.toHaveBeenCalled();
  });

  it("returns the installed→available range on success", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(availableUpdate);
    changelogSeam.fetchChangelog.mockResolvedValue([
      { version: "2.0.0", date: "2026-08-10", body: "b2" },
      { version: "1.5.0", date: "2026-08-05", body: "b1.5" },
      { version: "1.0.0", date: "2026-08-01", body: "b1" }, // installed — excluded
    ]);
    const svc = await freshService();
    await svc.check();

    expect((await svc.getChangelog()).map((e) => e.version)).toEqual([
      "2.0.0",
      "1.5.0",
    ]);
  });

  it("falls back to the manifest's own notes when the fetch fails", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(availableUpdate);
    changelogSeam.fetchChangelog.mockRejectedValue(new Error("network"));
    const svc = await freshService();
    await svc.check();

    expect(await svc.getChangelog()).toEqual([
      {
        version: "2.0.0",
        date: "2026-08-10",
        body: "fallback notes for 2.0.0",
      },
    ]);
  });

  it("falls back to the manifest's own notes when the range comes back empty", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue(availableUpdate);
    // Range fetch succeeds but has nothing between 1.0.0 and 2.0.0.
    changelogSeam.fetchChangelog.mockResolvedValue([
      { version: "1.0.0", date: "2026-08-01", body: "b1" },
    ]);
    const svc = await freshService();
    await svc.check();

    expect(await svc.getChangelog()).toEqual([
      {
        version: "2.0.0",
        date: "2026-08-10",
        body: "fallback notes for 2.0.0",
      },
    ]);
  });

  it("returns [] when the fetch fails and there is no fallback body", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue({
      ...availableUpdate,
      body: undefined,
    });
    changelogSeam.fetchChangelog.mockRejectedValue(new Error("network"));
    const svc = await freshService();
    await svc.check();

    expect(await svc.getChangelog()).toEqual([]);
  });
});

describe("UpdateService.reportAction", () => {
  it("reports the action with the available version", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue({ version: "9.9.9" });
    const svc = await freshService();
    await svc.check();

    svc.reportAction("skipped-version");

    expect(analyticsSeam.reportUpdateAction).toHaveBeenCalledWith(
      "skipped-version",
      "9.9.9",
    );
  });

  it("is a no-op when there is no available version", async () => {
    const svc = await freshService();

    svc.reportAction("skipped-later");

    expect(analyticsSeam.reportUpdateAction).not.toHaveBeenCalled();
  });

  it("reports 'installed' from installAndRelaunch before the install call", async () => {
    seam.isStableApp.mockResolvedValue(true);
    seam.checkForUpdate.mockResolvedValue({ version: "9.9.9" });
    seam.installUpdate.mockResolvedValue(undefined);
    const svc = await freshService();
    await svc.check();

    await svc.installAndRelaunch();

    expect(analyticsSeam.reportUpdateAction).toHaveBeenCalledWith(
      "installed",
      "9.9.9",
    );
  });
});
